import type {
  BillingMethod,
  CallLanguage,
  Channel,
  ConsultationOutcome,
  ConsultationType,
  Contract,
  InvoiceDraft,
  InvoiceLine,
  Kobo,
  LedgerKind,
  NormalizedMember,
  RowError,
} from '@hc247/core';

export type ClientType = 'hmo' | 'government' | 'employer';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  isPilot: boolean;
}

export interface Member {
  id: string;
  clientId: string;
  externalMemberId: string;
  fullName: string;
  dateOfBirth: string | null;
  phoneE164: string;
  planCode: string | null;
  status: 'active' | 'suspended';
  usesApp: boolean;
}

export interface MemberCounts {
  active: number;
  suspended: number;
  notOnApp: number;
}

export type MemberFilter = 'active' | 'suspended' | 'not_on_app';

/**
 * A consultation as an HMO's portal users may see it. Mirrors the
 * public.client_consultations view: therapy diagnoses are always null.
 */
export interface ClientConsultation {
  id: string;
  occurredAt: string;
  type: ConsultationType;
  channel: Channel | null;
  language: CallLanguage | null;
  memberId: string;
  externalMemberId: string;
  memberName: string;
  clinicianName: string | null;
  clinicianLicence: string | null;
  icd10Code: string | null;
  diagnosisLabel: string | null;
  outcome: ConsultationOutcome | null;
  chargeKobo: Kobo;
  billing: BillingMethod;
  externalRef: string | null;
}

/** A consultation as operations and finance see it (public.billing_consultations): no diagnoses. */
export interface BillingConsultation {
  id: string;
  clientId: string;
  occurredAt: string;
  type: ConsultationType;
  channel: Channel | null;
  language: CallLanguage | null;
  outcome: ConsultationOutcome | null;
  chargeKobo: Kobo;
  billing: BillingMethod;
}

export interface LedgerRow {
  occurredAt: string;
  kind: LedgerKind;
  amountKobo: Kobo;
  reference?: string;
  note?: string;
  consultationCount?: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'part_paid' | 'paid' | 'void';

export interface Invoice {
  id: string;
  clientId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  subtotalKobo: Kobo;
  vatKobo: Kobo;
  totalKobo: Kobo;
  paidKobo: Kobo;
  dueOn: string | null;
  /** Date the invoice became fully paid. */
  paidOn: string | null;
  payments: InvoicePayment[];
}

export interface InvoicePayment {
  amountKobo: Kobo;
  paidOn: string;
  reference: string | null;
}

export type StaffRole = 'ops_admin' | 'finance' | 'clinical_lead' | 'coordinator' | 'gp' | 'therapist';

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  languages: CallLanguage[];
  licenceNumber: string | null;
  licenceExpiresOn: string | null;
  status: 'invited' | 'active' | 'disabled';
}

export interface MemberImportSummary {
  filename: string;
  uploadedAt: string;
  rowsTotal: number;
  added: number;
  updated: number;
  errors: RowError[];
}

/**
 * Everything the web app reads and writes. The demo implementation serves
 * generated data; the Supabase implementation will read through the secured
 * views so the database's access rules always apply.
 */
export interface DataSource {
  listClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  contractsFor(clientId: string): Promise<Contract[]>;

  memberCounts(clientId: string): Promise<MemberCounts>;
  searchMembers(
    clientId: string,
    opts: { filter: MemberFilter; query?: string; offset: number; limit: number },
  ): Promise<{ rows: Member[]; total: number }>;
  memberIdsFor(clientId: string): Promise<Set<string>>;
  saveMemberImport(
    clientId: string,
    members: NormalizedMember[],
    meta: { filename: string; rowsTotal: number; errors: RowError[] },
  ): Promise<MemberImportSummary>;
  lastMemberImport(clientId: string): Promise<MemberImportSummary | null>;

  /** Portal view of a client's consultations between two Lagos dates (inclusive). */
  clientConsultations(clientId: string, from: string, to: string): Promise<ClientConsultation[]>;
  /** Staff billing view, optionally for one client. */
  billingConsultations(from: string, to: string, clientId?: string): Promise<BillingConsultation[]>;

  setMemberStatus(clientId: string, memberId: string, status: Member['status']): Promise<void>;

  creditLedger(clientId: string): Promise<LedgerRow[]>;
  recordTopUp(clientId: string, top: { amountKobo: Kobo; receivedOn: string; reference: string }): Promise<void>;

  invoices(clientId?: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | null>;
  createInvoiceDraft(clientId: string, draft: InvoiceDraft): Promise<Invoice>;
  sendInvoice(id: string, dueOn: string): Promise<Invoice>;
  /** Adds a payment; the invoice becomes part-paid or paid. Refuses overpayment. */
  recordPayment(id: string, payment: InvoicePayment): Promise<Invoice>;

  listStaff(): Promise<StaffMember[]>;
  inviteStaff(input: Omit<StaffMember, 'id' | 'status'>): Promise<StaffMember>;
}

/** A business rule refused the change. `code` is shown to the user via lib/notices.ts. */
export class DataRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DataRuleError';
  }
}
