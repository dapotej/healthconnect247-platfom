import { parseDate } from '../dates.js';
import { normalizeNigerianPhone } from '../phone.js';
import { parseCsv, resolveColumns, spreadsheetRow, type RowError } from './csv.js';

export type MemberField = 'fullName' | 'memberId' | 'phone' | 'dateOfBirth' | 'plan';

/** Header names we recognise in HMO member lists. Extend as clients send files. */
export const MEMBER_COLUMN_ALIASES: Record<MemberField, string[]> = {
  fullName: ['full name', 'name', 'member name', 'enrollee name', 'enrollee', 'beneficiary name'],
  memberId: ['member id', 'memberid', 'member no', 'member number', 'enrollee id', 'enrollee no', 'policy number', 'id number', 'hmo id'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'gsm', 'gsm number', 'telephone'],
  dateOfBirth: ['date of birth', 'dob', 'birth date', 'birthdate'],
  plan: ['plan', 'plan code', 'plan name', 'benefit', 'benefits', 'package'],
};

const REQUIRED: MemberField[] = ['fullName', 'memberId', 'phone'];

export interface NormalizedMember {
  row: number;
  externalMemberId: string;
  fullName: string;
  phoneE164: string;
  dateOfBirth: string | null;
  planCode: string | null;
  /** True if this member ID already exists for the client (the row updates it). */
  isUpdate: boolean;
}

export interface MemberImportResult {
  rowsTotal: number;
  members: NormalizedMember[];
  errors: RowError[];
  added: number;
  updated: number;
}

export class MissingColumnsError extends Error {
  constructor(public readonly missing: string[]) {
    super(`The file is missing required columns: ${missing.join(', ')}`);
    this.name = 'MissingColumnsError';
  }
}

/**
 * Check an uploaded member list and turn it into clean member records.
 *
 * Rows with problems are reported, not imported, so a client can fix them
 * and re-upload. Members missing from the file are never removed.
 */
export function validateMemberList(
  csvText: string,
  existingMemberIds: ReadonlySet<string>,
  columnOverrides: Partial<Record<MemberField, string>> = {},
): MemberImportResult {
  const { headers, rows } = parseCsv(csvText);
  const cols = resolveColumns(headers, MEMBER_COLUMN_ALIASES, columnOverrides);
  const missing = REQUIRED.filter((f) => cols[f] === undefined);
  if (missing.length > 0) throw new MissingColumnsError(missing);

  const members: NormalizedMember[] = [];
  const errors: RowError[] = [];
  const firstRowForId = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = spreadsheetRow(i);
    const get = (f: MemberField) => {
      const col = cols[f];
      return col === undefined ? '' : (raw[col] ?? '').trim();
    };
    const fullName = get('fullName').replace(/\s+/g, ' ');
    const memberId = get('memberId').toUpperCase();
    const phoneRaw = get('phone');
    const dobRaw = get('dateOfBirth');
    const label = fullName || '(no name)';

    const problems: string[] = [];
    if (!fullName) problems.push('Name missing');
    if (!memberId) problems.push('Member ID missing');
    const phone = phoneRaw ? normalizeNigerianPhone(phoneRaw) : null;
    if (!phoneRaw) problems.push('Phone number missing');
    else if (!phone) problems.push(`Phone number not valid (${phoneRaw})`);
    const dob = dobRaw ? parseDate(dobRaw) : null;
    if (dobRaw && !dob) problems.push(`Date of birth not valid (${dobRaw})`);
    if (memberId) {
      const earlier = firstRowForId.get(memberId);
      if (earlier !== undefined) problems.push(`Member ID also used on row ${earlier}`);
      else firstRowForId.set(memberId, row);
    }

    if (problems.length > 0) {
      errors.push({ row, name: label, problem: problems.join('; ') });
      return;
    }
    members.push({
      row,
      externalMemberId: memberId,
      fullName,
      phoneE164: phone!,
      dateOfBirth: dob,
      planCode: get('plan') || null,
      isUpdate: existingMemberIds.has(memberId),
    });
  });

  const updated = members.filter((m) => m.isUpdate).length;
  return { rowsTotal: rows.length, members, errors, added: members.length - updated, updated };
}
