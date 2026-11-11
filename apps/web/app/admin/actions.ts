'use server';

import { buildInvoice, contractOn, lagosDate, LANGUAGES, MissingColumnsError, parseNairaInput, validateMemberList, type CallLanguage } from '@hc247/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { UploadState } from '@/app/portal/members/actions';
import { getData, now } from '@/lib/data';
import { DataRuleError, type StaffRole } from '@/lib/data/types';
import { addDays } from '@/lib/period';
import { can, requireStaff, type SessionUser } from '@/lib/session';

type Check = (u: SessionUser) => boolean;

async function staffWho(check: Check): Promise<SessionUser | null> {
  const user = await requireStaff();
  return check(user) ? user : null;
}

/** Only redirect back to admin pages, never to an address taken from the form. */
function backTo(raw: FormDataEntryValue | null, fallback: string): string {
  const s = typeof raw === 'string' ? raw : '';
  return /^\/admin(\/[\w\-/]*)?(\?[\w\-=&%.+]*)?$/.test(s) ? s : fallback;
}

function withNotice(path: string, notice: string, n?: number): string {
  const [base, query = ''] = path.split('?') as [string, string?];
  const q = new URLSearchParams(query);
  q.delete('notice');
  q.delete('n');
  q.set('notice', notice);
  if (n !== undefined) q.set('n', String(n));
  return `${base}?${q.toString()}`;
}

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function pastDate(value: string, today: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && value <= today ? value : null;
}

async function run(back: string, action: () => Promise<string | { notice: string; n?: number }>): Promise<never> {
  let target: string;
  try {
    const result = await action();
    target = typeof result === 'string' ? withNotice(back, result) : withNotice(back, result.notice, result.n);
  } catch (err) {
    if (err instanceof DataRuleError) target = withNotice(back, err.code);
    else throw err;
  }
  revalidatePath('/admin', 'layout');
  redirect(target);
}

// ── Members ─────────────────────────────────────────────────────────────

export async function uploadMembersForClientAction(_prev: UploadState, form: FormData): Promise<UploadState> {
  if (!(await staffWho(can.manageMembers))) return { status: 'error', message: 'Only operations admins can upload member lists.' };
  const data = getData();
  const clientId = field(form, 'clientId');
  if (!(await data.getClient(clientId))) return { status: 'error', message: 'Choose a client first.' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: 'Choose a CSV file to upload.' };
  if (file.size > 5 * 1024 * 1024) return { status: 'error', message: 'The file is larger than 5 MB. Split it into smaller files.' };
  if (!/\.csv$/i.test(file.name)) return { status: 'error', message: 'Save the spreadsheet as CSV and upload that.' };
  try {
    const result = validateMemberList(await file.text(), await data.memberIdsFor(clientId));
    const summary = await data.saveMemberImport(clientId, result.members, { filename: file.name, rowsTotal: result.rowsTotal, errors: result.errors });
    revalidatePath('/admin/members');
    return { status: 'done', summary };
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      return { status: 'error', message: `Missing columns: ${err.missing.join(', ')}. Use the template or check the headings.` };
    }
    return { status: 'error', message: 'We couldn’t read this file. Check it’s a CSV export of the member list.' };
  }
}

export async function setMemberStatusAction(form: FormData) {
  const back = backTo(form.get('back'), '/admin/members');
  await run(back, async () => {
    if (!(await staffWho(can.manageMembers))) return 'not_allowed';
    const status = field(form, 'status') === 'suspended' ? 'suspended' : 'active';
    await getData().setMemberStatus(field(form, 'clientId'), field(form, 'memberId'), status);
    return status === 'suspended' ? 'member_suspended' : 'member_restored';
  });
}

// ── Billing ─────────────────────────────────────────────────────────────

export async function createInvoiceDraftsAction(form: FormData) {
  const back = backTo(form.get('back'), '/admin/billing');
  await run(back, async () => {
    if (!(await staffWho(can.manageInvoices))) return 'not_allowed';
    const month = field(form, 'month');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'bad_month';
    const [y, m] = month.split('-').map(Number) as [number, number];
    const periodStart = `${month}-01`;
    const periodEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const data = getData();
    const existing = await data.invoices();
    let created = 0;
    for (const client of await data.listClients()) {
      const contract = contractOn(await data.contractsFor(client.id), `${periodStart}T12:00:00+01:00`);
      if (!contract || contract.pricingModel === 'flex') continue;
      if (existing.some((i) => i.clientId === client.id && i.periodStart === periodStart && i.status !== 'void')) continue;
      const draft = buildInvoice({
        contract,
        periodStart: periodStart < contract.startsOn ? contract.startsOn : periodStart,
        periodEnd: periodEnd > contract.endsOn ? contract.endsOn : periodEnd,
        consultations: await data.billingConsultations(periodStart, periodEnd, client.id),
        activeMembers: (await data.memberCounts(client.id)).active,
      });
      await data.createInvoiceDraft(client.id, { ...draft, periodStart, periodEnd });
      created++;
    }
    return created === 0 ? 'drafts_none' : { notice: 'drafts_created', n: created };
  });
}

export async function sendInvoiceAction(form: FormData) {
  const back = backTo(form.get('back'), '/admin/billing');
  await run(back, async () => {
    if (!(await staffWho(can.manageInvoices))) return 'not_allowed';
    await getData().sendInvoice(field(form, 'invoiceId'), addDays(lagosDate(now()), 14));
    return 'invoice_sent';
  });
}

export async function recordPaymentAction(form: FormData) {
  const back = backTo(form.get('back'), '/admin/billing');
  await run(back, async () => {
    if (!(await staffWho(can.manageInvoices))) return 'not_allowed';
    const amountKobo = parseNairaInput(field(form, 'amount'));
    if (amountKobo === null) return 'bad_amount';
    const paidOn = pastDate(field(form, 'paidOn'), lagosDate(now()));
    if (!paidOn) return 'bad_date';
    const reference = field(form, 'reference').slice(0, 80);
    if (!reference) return 'missing_reference';
    await getData().recordPayment(field(form, 'invoiceId'), { amountKobo, paidOn, reference });
    return 'payment_recorded';
  });
}

export async function recordTopUpAction(form: FormData) {
  const back = backTo(form.get('back'), '/admin/billing');
  await run(back, async () => {
    if (!(await staffWho(can.recordTopUps))) return 'not_allowed';
    const amountKobo = parseNairaInput(field(form, 'amount'));
    if (amountKobo === null) return 'bad_amount';
    const receivedOn = pastDate(field(form, 'receivedOn'), lagosDate(now()));
    if (!receivedOn) return 'bad_date';
    const reference = field(form, 'reference').slice(0, 80);
    if (!reference) return 'missing_reference';
    await getData().recordTopUp(field(form, 'clientId'), { amountKobo, receivedOn, reference });
    return 'topup_recorded';
  });
}

// ── Staff ───────────────────────────────────────────────────────────────

const STAFF_ROLES: StaffRole[] = ['ops_admin', 'finance', 'clinical_lead', 'coordinator', 'gp', 'therapist'];
const LICENSED: StaffRole[] = ['clinical_lead', 'gp', 'therapist'];

export async function inviteStaffAction(form: FormData) {
  await run('/admin/staff', async () => {
    if (!(await staffWho(can.manageStaff))) return 'not_allowed';
    const fullName = field(form, 'fullName').replace(/\s+/g, ' ').slice(0, 100);
    if (!fullName) return 'missing_name';
    const email = field(form, 'email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return 'bad_email';
    const role = STAFF_ROLES.find((r) => r === field(form, 'role'));
    if (!role) return 'bad_role';
    const languages = form
      .getAll('languages')
      .map(String)
      .filter((l): l is CallLanguage => (LANGUAGES as readonly string[]).includes(l) && l !== 'other');
    const licenceNumber = field(form, 'licenceNumber').slice(0, 60) || null;
    const expiry = field(form, 'licenceExpiresOn');
    const licenceExpiresOn = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;
    if (LICENSED.includes(role) && (!licenceNumber || !licenceExpiresOn)) return 'bad_licence';
    await getData().inviteStaff({ fullName, email, role, languages: languages.length ? languages : ['english'], licenceNumber, licenceExpiresOn });
    return 'staff_invited';
  });
}
