import type { PostgrestError } from '@supabase/supabase-js';
import { supabaseAdmin, supabaseServer, siteUrl } from '../supabase/server';
import {
  DataRuleError,
  type Client,
  type ConsultationImportRecord,
  type DataSource,
  type Invoice,
  type MemberImportSummary,
  type MemberIndexRow,
  type StaffMember,
} from './types';

/**
 * The real data source. Every call goes to an app_* database function
 * (supabase/migrations/*_app_api.sql) as the signed-in user, so row-level
 * security decides what they see. Consultations are read only through the
 * client_consultations and billing_consultations views.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toError(error: PostgrestError): Error {
  // Business rules refused the change: the message is a notice code.
  if (error.hint === 'hc247') return new DataRuleError(error.message, error.message);
  // Row-level security or missing rights.
  if (error.code === '42501') return new DataRuleError('not_allowed', error.message);
  return new Error(`Database error ${error.code}: ${error.message}`);
}

/** Call an app_* function. Argument names must match the SQL parameters (checked by test/api-contract.test.ts). */
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const db = await supabaseServer();
  const { data, error } = await db.rpc(fn, args);
  if (error) throw toError(error);
  return data as T;
}

export const supabaseDataSource: DataSource = {
  async listClients() {
    return call<Client[]>('app_list_clients', {});
  },
  async getClient(id) {
    if (!UUID.test(id)) return null;
    return (await call<Client[]>('app_list_clients', {})).find((c) => c.id === id) ?? null;
  },
  async contractsFor(clientId) {
    if (!UUID.test(clientId)) return [];
    return call('app_contracts', { p_client: clientId });
  },

  async memberCounts(clientId) {
    return call('app_member_counts', { p_client: clientId });
  },
  async searchMembers(clientId, { filter, query, offset, limit }) {
    return call('app_search_members', { p_client: clientId, p_filter: filter, p_query: query ?? null, p_offset: offset, p_limit: limit });
  },
  async memberIdsFor(clientId) {
    return new Set(await call<string[]>('app_member_ids', { p_client: clientId }));
  },
  async saveMemberImport(clientId, members, meta) {
    return call<MemberImportSummary>('app_save_member_import', {
      p_client: clientId,
      p_filename: meta.filename,
      p_rows_total: meta.rowsTotal,
      p_members: members.map((m) => ({
        externalMemberId: m.externalMemberId,
        fullName: m.fullName,
        phoneE164: m.phoneE164,
        dateOfBirth: m.dateOfBirth,
        planCode: m.planCode,
      })),
      p_errors: meta.errors,
    });
  },
  async lastMemberImport(clientId) {
    return call<MemberImportSummary | null>('app_last_member_import', { p_client: clientId });
  },

  async clientConsultations(clientId, from, to) {
    return call('app_client_consultations', { p_client: clientId, p_from: from, p_to: to });
  },
  async billingConsultations(from, to, clientId) {
    return call('app_billing_consultations', { p_from: from, p_to: to, p_client: clientId ?? null });
  },

  async setMemberStatus(clientId, memberId, status) {
    if (!UUID.test(clientId) || !UUID.test(memberId)) throw new DataRuleError('member_not_found', 'Member not found');
    await call('app_set_member_status', { p_client: clientId, p_member: memberId, p_status: status });
  },

  async creditLedger(clientId) {
    return call('app_credit_ledger', { p_client: clientId });
  },
  async recordTopUp(clientId, top) {
    await call('app_record_topup', {
      p_client: clientId,
      p_amount: top.amountKobo,
      p_received_on: top.receivedOn,
      p_reference: top.reference,
    });
  },

  async invoices(clientId) {
    return call<Invoice[]>('app_invoices', { p_client: clientId ?? null });
  },
  async getInvoice(id) {
    if (!UUID.test(id)) return null;
    return call<Invoice | null>('app_get_invoice', { p_invoice: id });
  },
  async createInvoiceDraft(clientId, draft) {
    return call<Invoice>('app_create_invoice_draft', {
      p_client: clientId,
      p_period_start: draft.periodStart,
      p_period_end: draft.periodEnd,
      p_lines: draft.lines,
      p_subtotal: draft.subtotalKobo,
      p_vat: draft.vatKobo,
      p_total: draft.totalKobo,
    });
  },
  async sendInvoice(id, dueOn) {
    if (!UUID.test(id)) throw new DataRuleError('invoice_not_found', 'Invoice not found');
    return call<Invoice>('app_send_invoice', { p_invoice: id, p_due_on: dueOn });
  },
  async recordPayment(id, payment) {
    if (!UUID.test(id)) throw new DataRuleError('invoice_not_found', 'Invoice not found');
    return call<Invoice>('app_record_payment', {
      p_invoice: id,
      p_amount: payment.amountKobo,
      p_paid_on: payment.paidOn,
      p_reference: payment.reference,
    });
  },

  async setClientEmrNames(clientId, names) {
    await call('app_set_client_emr_names', { p_client: clientId, p_names: names });
  },
  async memberIndex(clientId) {
    return call<MemberIndexRow[]>('app_member_index', { p_client: clientId });
  },
  async existingConsultationRefs(refs) {
    if (refs.length === 0) return new Set();
    return new Set(await call<string[]>('app_existing_refs', { p_source: 'emr_import', p_refs: refs }));
  },
  async recordConsultationImport(input) {
    return call('app_record_consultation_import', {
      p_source_system: 'HealthConnect EMR',
      p_filename: input.filename,
      p_rows_total: input.rowsTotal,
      p_consultations: input.consultations,
      p_member_codes: input.memberCodes,
      p_problems: input.problems,
      p_already_imported: input.alreadyImported,
    });
  },
  async consultationImports(limit) {
    return call<ConsultationImportRecord[]>('app_consultation_imports', { p_limit: limit });
  },

  async listStaff() {
    return call<StaffMember[]>('app_list_staff', {});
  },
  async inviteStaff(input) {
    if (await call<boolean>('app_staff_email_taken', { p_email: input.email })) {
      throw new DataRuleError('staff_exists', 'Someone with this email is already on the team');
    }
    // Check the caller may add staff before sending any email.
    const me = await call<{ role: string } | null>('app_whoami', {});
    if (me?.role !== 'ops_admin') throw new DataRuleError('not_allowed', 'Only operations admins invite staff');

    const admin = supabaseAdmin();
    if (!admin) throw new DataRuleError('invites_unavailable', 'SUPABASE_SECRET_KEY is not set');
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/account/password`,
      data: { full_name: input.fullName },
    });
    if (error || !data.user) {
      if (error && /already|registered|exists/i.test(error.message)) {
        throw new DataRuleError('staff_exists', error.message);
      }
      throw new Error(`Invitation failed: ${error?.message ?? 'no user returned'}`);
    }
    return call<StaffMember>('app_add_staff_profile', {
      p_user: data.user.id,
      p_full_name: input.fullName,
      p_email: input.email,
      p_role: input.role,
      p_languages: input.languages,
      p_licence: input.licenceNumber,
      p_licence_expires: input.licenceExpiresOn,
    });
  },
};
