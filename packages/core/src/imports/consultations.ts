import { parseLagosDateTime } from '../dates.js';
import { normalizeNigerianPhone } from '../phone.js';
import type { CallLanguage, Channel, ConsultationOutcome, ConsultationType } from '../types.js';
import { normalizeHeader, parseCsv, resolveColumns, spreadsheetRow, type RowError } from './csv.js';
import { MissingColumnsError } from './members.js';

export type ConsultationField =
  | 'externalRef'
  | 'occurredAt'
  | 'time'
  | 'memberId'
  | 'phone'
  | 'type'
  | 'channel'
  | 'language'
  | 'clinicianName'
  | 'clinicianLicence'
  | 'icd10'
  | 'diagnosis'
  | 'outcome';

/**
 * Header names we expect in call-centre exports. This is a starting guess:
 * once we have the real export, set exact column names per source system in
 * `columnOverrides` (see docs/call-centre-import.md).
 */
export const CONSULTATION_COLUMN_ALIASES: Record<ConsultationField, string[]> = {
  externalRef: ['call id', 'reference', 'ref', 'ticket id', 'ticket number', 'case id', 'case number', 'consultation id', 'interaction id'],
  occurredAt: ['date time', 'datetime', 'start time', 'call start', 'timestamp', 'date', 'call date', 'consultation date'],
  time: ['time', 'call time', 'consultation time'],
  memberId: ['member id', 'enrollee id', 'enrollee no', 'member no', 'policy number', 'hmo id'],
  phone: ['phone', 'phone number', 'caller number', 'caller id', 'mobile', 'msisdn', 'ani'],
  type: ['consultation type', 'type', 'service', 'service type', 'call type', 'category'],
  channel: ['channel', 'call source', 'source', 'medium'],
  language: ['language', 'call language'],
  clinicianName: ['doctor', 'clinician', 'attended by', 'handled by', 'agent', 'provider'],
  clinicianLicence: ['mdcn', 'mdcn number', 'mdcn no', 'licence number', 'license number', 'folio number'],
  icd10: ['icd10', 'icd 10', 'icd code', 'icd10 code', 'diagnosis code'],
  diagnosis: ['diagnosis', 'impression', 'working diagnosis'],
  outcome: ['outcome', 'disposition', 'result', 'call outcome'],
};

const REQUIRED: ConsultationField[] = ['externalRef', 'occurredAt', 'type'];

export interface NormalizedConsultation {
  row: number;
  externalRef: string;
  occurredAt: string;
  memberExternalId: string | null;
  phoneE164: string | null;
  type: ConsultationType;
  channel: Channel | null;
  language: CallLanguage | null;
  clinicianName: string | null;
  clinicianLicence: string | null;
  icd10Code: string | null;
  diagnosisLabel: string | null;
  outcome: ConsultationOutcome | null;
}

export interface ConsultationParseResult {
  rowsTotal: number;
  consultations: NormalizedConsultation[];
  errors: RowError[];
}

const ICD10 = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

export function mapConsultationType(value: string): ConsultationType | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/therap|counsel|psych|mental/.test(v)) return 'therapy';
  if (/follow/.test(v)) return 'follow_up';
  if (/coordinator|enquiry|inquiry|resolved|non clinical|information|triage only/.test(v)) return 'coordinator_resolved';
  if (/\bgp\b|doctor|medical|consult|clinical/.test(v)) return 'gp';
  return null;
}

export function mapChannel(value: string): Channel | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/video/.test(v)) return 'app_video';
  if (/call ?back/.test(v)) return 'callback';
  if (/toll|0800|ivr|phone line|inbound|pstn|landline/.test(v)) return 'toll_free';
  if (/app|voip|voice/.test(v)) return 'app_voice';
  return null;
}

export function mapLanguage(value: string): CallLanguage | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/english|^en$/.test(v)) return 'english';
  if (/yoruba|^yo$/.test(v)) return 'yoruba';
  if (/igbo|^ig$/.test(v)) return 'igbo';
  if (/hausa|^ha$/.test(v)) return 'hausa';
  return 'other';
}

export function mapOutcome(value: string): ConsultationOutcome | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/prescri|rx|drug|medication/.test(v)) return 'prescription';
  if (/lab|test|investigation/.test(v)) return 'lab_test';
  if (/refer|hospital|escalat/.test(v)) return 'referral';
  if (/session/.test(v)) return 'session_held';
  if (/call ?back/.test(v)) return 'callback_booked';
  if (/advi|counsel|educat|reassur/.test(v)) return 'advice';
  return 'other';
}

/**
 * Read a call-centre export and turn each row into a clean consultation
 * record. Member matching and pricing happen afterwards, because they need
 * the database (see matchMember and priceConsultation).
 */
export function parseConsultationExport(
  csvText: string,
  columnOverrides: Partial<Record<ConsultationField, string>> = {},
): ConsultationParseResult {
  const { headers, rows } = parseCsv(csvText);
  const cols = resolveColumns(headers, CONSULTATION_COLUMN_ALIASES, columnOverrides);
  const missing: string[] = REQUIRED.filter((f) => cols[f] === undefined);
  if (cols.memberId === undefined && cols.phone === undefined) missing.push('memberId or phone');
  if (missing.length > 0) throw new MissingColumnsError(missing);

  const consultations: NormalizedConsultation[] = [];
  const errors: RowError[] = [];
  const seenRefs = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = spreadsheetRow(i);
    const get = (f: ConsultationField) => {
      const col = cols[f];
      return col === undefined ? '' : (raw[col] ?? '').trim();
    };
    const externalRef = get('externalRef');
    const label = externalRef || `row ${row}`;
    const problems: string[] = [];

    if (!externalRef) problems.push('Reference missing');
    else if (seenRefs.has(externalRef)) problems.push(`Reference also used on row ${seenRefs.get(externalRef)}`);
    else seenRefs.set(externalRef, row);

    const when = cols.time !== undefined && get('time') ? `${get('occurredAt')} ${get('time')}` : get('occurredAt');
    const occurredAt = when ? parseLagosDateTime(when) : null;
    if (!occurredAt) problems.push(when ? `Date and time not valid (${when})` : 'Date and time missing');

    const typeRaw = get('type');
    const type = mapConsultationType(typeRaw);
    if (!type) problems.push(typeRaw ? `Consultation type not recognised (${typeRaw})` : 'Consultation type missing');

    const memberId = get('memberId').toUpperCase() || null;
    const phoneRaw = get('phone');
    const phone = phoneRaw ? normalizeNigerianPhone(phoneRaw) : null;
    if (!memberId && !phone) problems.push(phoneRaw ? `Phone number not valid (${phoneRaw})` : 'Member ID and phone number missing');

    const icdRaw = get('icd10').toUpperCase().replace(/\s/g, '');
    if (icdRaw && !ICD10.test(icdRaw)) problems.push(`Diagnosis code not valid (${icdRaw})`);

    if (problems.length > 0) {
      errors.push({ row, name: label, problem: problems.join('; ') });
      return;
    }
    consultations.push({
      row,
      externalRef,
      occurredAt: occurredAt!,
      memberExternalId: memberId,
      phoneE164: phone,
      type: type!,
      channel: mapChannel(get('channel')),
      language: mapLanguage(get('language')),
      clinicianName: get('clinicianName') || null,
      clinicianLicence: get('clinicianLicence') || null,
      icd10Code: icdRaw || null,
      diagnosisLabel: get('diagnosis') || null,
      outcome: mapOutcome(get('outcome')),
    });
  });

  return { rowsTotal: rows.length, consultations, errors };
}

export interface MemberIndex {
  byExternalId: ReadonlyMap<string, string>;
  /** Phone -> member ids. Families sometimes share one phone. */
  byPhone: ReadonlyMap<string, readonly string[]>;
}

export type MatchResult = { memberId: string } | { problem: string };

/** Find the member a consultation belongs to: member ID first, then a unique phone match. */
export function matchMember(c: NormalizedConsultation, index: MemberIndex): MatchResult {
  if (c.memberExternalId) {
    const id = index.byExternalId.get(c.memberExternalId);
    if (id) return { memberId: id };
    if (!c.phoneE164) return { problem: `Member ID not found (${c.memberExternalId})` };
  }
  if (c.phoneE164) {
    const ids = index.byPhone.get(c.phoneE164) ?? [];
    if (ids.length === 1) return { memberId: ids[0]! };
    if (ids.length > 1) return { problem: 'Phone number matches more than one member; member ID needed' };
  }
  return { problem: 'No member found with this member ID or phone number' };
}
