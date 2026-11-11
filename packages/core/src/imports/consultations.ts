import { parseLagosDateTime } from '../dates.js';
import { normalizeNigerianPhone } from '../phone.js';
import type {
  CallLanguage,
  Channel,
  ConsultationOutcome,
  ConsultationType,
  DiagnosisCodeSystem,
} from '../types.js';
import { normalizeHeader, parseCsv, resolveColumns, spreadsheetRow, type CsvTable, type RowError } from './csv.js';
import { MissingColumnsError } from './members.js';

export type ConsultationField =
  | 'externalRef'
  | 'occurredAt'
  | 'time'
  | 'clientName'
  | 'memberId'
  | 'patientCode'
  | 'phone'
  | 'type'
  | 'subtype'
  | 'status'
  | 'noteStatus'
  | 'channel'
  | 'language'
  | 'clinicianName'
  | 'clinicianLicence'
  | 'diagnosisCode'
  | 'diagnosis'
  | 'outcome';

/**
 * Accepted column headings per field, compared after normalizeHeader
 * ("Encounter_EncounterId" -> "encounter encounterid"). The first alias found
 * wins. The `encounter …` / `doctornote …` names are HealthConnect's EMR
 * export (docs/call-centre-import.md); the rest cover other likely exports.
 *
 * Only these columns are ever read. Clinical notes in the export (complaint,
 * history, vitals, assessment, plan) are ignored and never stored.
 */
export const CONSULTATION_COLUMN_ALIASES: Record<ConsultationField, string[]> = {
  externalRef: ['encounter encounterid', 'call id', 'reference', 'ref', 'ticket id', 'ticket number', 'case id', 'case number', 'consultation id', 'interaction id', 'encounter id'],
  occurredAt: ['encounter encounterdate', 'date time', 'datetime', 'start time', 'call start', 'timestamp', 'date', 'call date', 'consultation date', 'encounter date'],
  time: ['time', 'call time', 'consultation time'],
  clientName: ['encounter servicename', 'client', 'hmo', 'scheme', 'service name', 'payer'],
  memberId: ['member id', 'enrollee id', 'enrollee no', 'enrollee number', 'member no', 'policy number', 'hmo id'],
  patientCode: ['patient patientcode', 'patient code', 'patient no', 'patient number', 'mrn'],
  phone: ['encounter contactnumber', 'phone', 'phone number', 'caller number', 'caller id', 'contact number', 'mobile', 'msisdn', 'ani'],
  type: ['encounter encountertype', 'consultation type', 'type', 'service', 'service type', 'call type', 'category'],
  subtype: ['encounter encountersubtype', 'subtype', 'sub type', 'encounter subtype'],
  status: ['encounter status', 'status', 'call status'],
  noteStatus: ['doctornote notestatus', 'note status'],
  channel: ['encounter communicationmethod', 'channel', 'communication method', 'call source', 'source', 'medium'],
  language: ['language', 'call language'],
  clinicianName: ['documentingdoctorname', 'assigneddoctorname', 'doctor', 'clinician', 'attended by', 'handled by', 'provider'],
  clinicianLicence: ['mdcn', 'mdcn number', 'mdcn no', 'licence number', 'license number', 'folio number'],
  diagnosisCode: ['doctornote icd10code', 'icd11', 'icd 11', 'icd11 code', 'icd10', 'icd 10', 'icd code', 'icd10 code', 'diagnosis code'],
  diagnosis: ['doctornote icd10description', 'diagnosis description', 'diagnosis', 'impression', 'working diagnosis'],
  outcome: ['encounter clinicaloutcome', 'doctornote clinicaloutcome', 'outcome', 'disposition', 'result', 'call outcome'],
};

const REQUIRED: ConsultationField[] = ['externalRef', 'occurredAt', 'type'];

export interface NormalizedConsultation {
  row: number;
  externalRef: string;
  occurredAt: string;
  /** The client as named in the export (e.g. "HYGEIA"); matched with matchClient. */
  clientName: string | null;
  memberExternalId: string | null;
  /** The source system's own patient number, remembered once a member is matched. */
  patientCode: string | null;
  phoneE164: string | null;
  type: ConsultationType;
  channel: Channel | null;
  language: CallLanguage | null;
  clinicianName: string | null;
  clinicianLicence: string | null;
  diagnosisCode: string | null;
  diagnosisCodeSystem: DiagnosisCodeSystem;
  diagnosisLabel: string | null;
  outcome: ConsultationOutcome | null;
}

export interface ConsultationParseResult {
  rowsTotal: number;
  consultations: NormalizedConsultation[];
  /** Rows that can't be imported as they stand. */
  errors: RowError[];
  /** Consultations not finished yet (still open, or the note is a draft). Import them again later. */
  pending: RowError[];
}

export interface ParseOptions {
  columnOverrides?: Partial<Record<ConsultationField, string>>;
  /** The coding system the source uses for diagnoses. HealthConnect's EMR uses ICD-11. */
  codeSystem?: DiagnosisCodeSystem;
}

const ICD10 = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
// ICD-11 stem codes (e.g. 1F40, CA0Z, FA01.Z, CA40.2Z, MF40.20) and extension
// codes (e.g. XN69B), optionally clustered with & or /. ICD-11 never uses I or O.
const ICD11_ONE = '(?:[1-9A-HJ-NP-Z][A-HJ-NP-Z][0-9][0-9A-HJ-NP-Z](?:\\.[0-9A-HJ-NP-Z]{1,2})?|X[0-9A-HJ-NP-Z]{4})';
const ICD11 = new RegExp(`^${ICD11_ONE}(?:[&/]${ICD11_ONE})*$`);

export function isDiagnosisCode(code: string, system: DiagnosisCodeSystem): boolean {
  return (system === 'icd11' ? ICD11 : ICD10).test(code);
}

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
  if (/toll|0800|ivr|phone line|pstn|landline/.test(v)) return 'toll_free';
  if (/app|voip/.test(v)) return 'app_voice';
  if (/phone|voice|telephone|inbound/.test(v)) return 'phone';
  if (/portal|web|chat/.test(v)) return 'web';
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

/**
 * Read an outcome. Doctors sometimes type the whole prescription here, so
 * this only keeps a category; the text itself is never stored.
 */
export function mapOutcome(value: string): ConsultationOutcome | null {
  const v = normalizeHeader(value);
  if (!v) return null;
  if (/refer|hospital|escalat|specialist/.test(v)) return 'referral';
  if (/investigation|\blab\b|urinalysis|\bmcs\b|\bfbc\b|scan|x ?ray/.test(v)) return 'lab_test';
  if (/prescri|\brx\b|drug|medicat|tr+eatment|\btabs?\b|\bcaps?\b|\bsyr|\bsus\b|cream|drops?\b|\bmg\b/.test(v)) return 'prescription';
  if (/session/.test(v)) return 'session_held';
  if (/call ?back/.test(v)) return 'callback_booked';
  if (/advi|counsel|educat|reassur|inquiry|enquiry|supportive/.test(v)) return 'advice';
  return 'other';
}

const FINISHED = /^(closed|completed?|finali[sz]ed|done|resolved)$/;

/** Parse a CSV export. See parseConsultationTable. */
export function parseConsultationExport(csvText: string, options: ParseOptions = {}): ConsultationParseResult {
  return parseConsultationTable(parseCsv(csvText), options);
}

/**
 * Turn each row of a consultation export (CSV, or a spreadsheet already read
 * into headings and text cells) into a clean consultation record. Client,
 * member matching and pricing happen afterwards, because they need the
 * database (see matchClient, matchMember and priceConsultation).
 */
export function parseConsultationTable(table: CsvTable, options: ParseOptions = {}): ConsultationParseResult {
  const codeSystem = options.codeSystem ?? 'icd11';
  const cols = resolveColumns(table.headers, CONSULTATION_COLUMN_ALIASES, options.columnOverrides ?? {});
  const missing: string[] = REQUIRED.filter((f) => cols[f] === undefined);
  if (cols.memberId === undefined && cols.phone === undefined && cols.patientCode === undefined) {
    missing.push('member ID, patient code or phone');
  }
  if (missing.length > 0) throw new MissingColumnsError(missing);

  const consultations: NormalizedConsultation[] = [];
  const errors: RowError[] = [];
  const pending: RowError[] = [];
  const seenRefs = new Map<string, number>();

  table.rows.forEach((raw, i) => {
    const row = spreadsheetRow(i);
    const get = (f: ConsultationField) => {
      const col = cols[f];
      return col === undefined ? '' : String(raw[col] ?? '').trim();
    };
    const externalRef = get('externalRef');
    const label = externalRef || `row ${row}`;

    const status = normalizeHeader(get('status'));
    const noteStatus = normalizeHeader(get('noteStatus'));
    if ((status && !FINISHED.test(status)) || (noteStatus && !FINISHED.test(noteStatus))) {
      pending.push({ row, name: label, problem: `Not finished yet (${get('status') || get('noteStatus')}). Import it again once it's closed.` });
      return;
    }

    const problems: string[] = [];
    if (!externalRef) problems.push('Reference missing');
    else if (seenRefs.has(externalRef)) problems.push(`Reference also used on row ${seenRefs.get(externalRef)}`);
    else seenRefs.set(externalRef, row);

    const when = cols.time !== undefined && get('time') ? `${get('occurredAt')} ${get('time')}` : get('occurredAt');
    const occurredAt = when ? parseLagosDateTime(when) : null;
    if (!occurredAt) problems.push(when ? `Date and time not valid (${when})` : 'Date and time missing');

    const typeRaw = get('subtype') || get('type');
    const type = mapConsultationType(typeRaw);
    if (!type) problems.push(typeRaw ? `Consultation type not recognised (${typeRaw})` : 'Consultation type missing');

    const memberId = get('memberId').toUpperCase() || null;
    const patientCode = get('patientCode') || null;
    const phoneRaw = get('phone');
    const phone = phoneRaw ? normalizeNigerianPhone(phoneRaw) : null;
    if (!memberId && !patientCode && !phone) {
      problems.push(phoneRaw ? `Phone number not valid (${phoneRaw})` : 'Member ID and phone number missing');
    }

    const codeRaw = get('diagnosisCode').toUpperCase().replace(/\s/g, '');
    if (codeRaw && !isDiagnosisCode(codeRaw, codeSystem)) {
      problems.push(`Diagnosis code not valid ${codeSystem === 'icd11' ? 'ICD-11' : 'ICD-10'} (${codeRaw})`);
    }

    if (problems.length > 0) {
      errors.push({ row, name: label, problem: problems.join('; ') });
      return;
    }
    consultations.push({
      row,
      externalRef,
      occurredAt: occurredAt!,
      clientName: get('clientName') || null,
      memberExternalId: memberId,
      patientCode,
      phoneE164: phone,
      type: type!,
      channel: mapChannel(get('channel')),
      language: mapLanguage(get('language')),
      clinicianName: get('clinicianName') || null,
      clinicianLicence: get('clinicianLicence') || null,
      diagnosisCode: codeRaw || null,
      diagnosisCodeSystem: codeSystem,
      diagnosisLabel: codeRaw ? get('diagnosis') || null : null,
      outcome: mapOutcome(get('outcome')),
    });
  });

  return { rowsTotal: table.rows.length, consultations, errors, pending };
}

export interface ClientNames {
  id: string;
  /** The names this client goes by in the source system's exports. */
  names: readonly string[];
}

/** Find the client named in an export row. Names are compared ignoring case, spacing and punctuation. */
export function matchClient(name: string | null, clients: readonly ClientNames[]): { clientId: string } | { problem: string } {
  if (!name) return { problem: 'Client name missing' };
  const key = normalizeHeader(name);
  const hits = clients.filter((c) => c.names.some((n) => normalizeHeader(n) === key));
  if (hits.length === 1) return { clientId: hits[0]!.id };
  if (hits.length > 1) return { problem: `Client name "${name}" is set up for more than one client` };
  return { problem: `Client "${name}" isn't set up. Add the name to the client in the admin console, or leave the row out.` };
}

export interface MemberIndex {
  /** Source-system patient code -> member id, for patients matched before. */
  byPatientCode?: ReadonlyMap<string, string>;
  byExternalId: ReadonlyMap<string, string>;
  /** Phone -> member ids. Families sometimes share one phone. */
  byPhone: ReadonlyMap<string, readonly string[]>;
}

export type MatchResult =
  | { memberId: string; via: 'patient_code' | 'member_id' | 'phone' }
  | { problem: string };

/**
 * Find the member a consultation belongs to, within one client's members:
 * a patient code matched before, then member ID, then a phone number exactly
 * one member has. Once matched, save the patient code against the member so
 * the next import finds them directly.
 */
export function matchMember(c: NormalizedConsultation, index: MemberIndex): MatchResult {
  if (c.patientCode) {
    const id = index.byPatientCode?.get(c.patientCode);
    if (id) return { memberId: id, via: 'patient_code' };
  }
  if (c.memberExternalId) {
    const id = index.byExternalId.get(c.memberExternalId);
    if (id) return { memberId: id, via: 'member_id' };
    if (!c.phoneE164) return { problem: `Member ID not found (${c.memberExternalId})` };
  }
  if (c.phoneE164) {
    const ids = index.byPhone.get(c.phoneE164) ?? [];
    if (ids.length === 1) return { memberId: ids[0]!, via: 'phone' };
    if (ids.length > 1) return { problem: 'Phone number matches more than one member; member ID needed' };
  }
  return { problem: 'No member found with this patient code, member ID or phone number' };
}
