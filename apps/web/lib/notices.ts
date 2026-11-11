/**
 * Messages shown after an admin action. Pages receive only a code in the URL
 * (?notice=…), never free text, so a crafted link can't put words on screen.
 */
const NOTICES: Record<string, { tone: 'info' | 'warn'; text: (n?: string) => string }> = {
  member_suspended: { tone: 'info', text: () => 'Member suspended. They can no longer use the service.' },
  member_restored: { tone: 'info', text: () => 'Member reactivated.' },
  drafts_created: {
    tone: 'info',
    text: (n) => (n === '1' ? '1 invoice created. Check it, then send it.' : `${n ?? 'New'} invoices created. Check them, then send each one.`),
  },
  drafts_none: { tone: 'info', text: () => 'No new invoices: every pay-as-you-go and Unlimited client already has one for that month.' },
  invoice_sent: { tone: 'info', text: () => 'Invoice sent. Payment is due in 14 days.' },
  payment_recorded: { tone: 'info', text: () => 'Payment recorded.' },
  topup_recorded: { tone: 'info', text: () => 'Top-up recorded. The client’s credit is available straight away.' },
  staff_invited: { tone: 'info', text: () => 'Invitation recorded. They’ll get an email to set a password once sign-in is connected.' },

  import_done: {
    tone: 'info',
    text: (n) => (n === '1' ? '1 consultation imported. Rows that weren’t imported are listed below.' : `${n ?? 'The'} consultations imported. Rows that weren’t imported are listed below.`),
  },
  bad_file: { tone: 'warn', text: () => 'Upload the EMR export as an Excel (.xlsx) or CSV file, up to 10 MB.' },
  emr_missing_columns: { tone: 'warn', text: () => 'That file doesn’t look like the EMR encounters export: the encounter ID, date or type column is missing.' },
  emr_names_saved: { tone: 'info', text: () => 'EMR names saved. Imports will match this client by them.' },
  reset_sent: { tone: 'info', text: () => 'If that email has an account, we’ve sent a link to set a new password. It works once, for an hour.' },
  password_set: { tone: 'info', text: () => 'Password saved. You’re signed in.' },
  signed_out: { tone: 'info', text: () => 'You’ve signed out.' },

  bad_credentials: { tone: 'warn', text: () => 'That email and password don’t match an account. Check them, or set a new password.' },
  no_access: { tone: 'warn', text: () => 'Your account doesn’t have access to this site. Ask HealthConnect operations to check your role.' },
  link_expired: { tone: 'warn', text: () => 'That link has expired or was already used. Ask for a new one below.' },
  weak_password: { tone: 'warn', text: () => 'Use at least 10 characters, and type the same password twice.' },
  emr_name_taken: { tone: 'warn', text: () => 'One of those EMR names already belongs to another client.' },
  invites_unavailable: { tone: 'warn', text: () => 'Invitations can’t be sent yet: the server key isn’t set up. See the setup notes.' },
  bad_amount: { tone: 'warn', text: () => 'Enter an amount in naira, for example 5,000,000.' },
  bad_date: { tone: 'warn', text: () => 'Enter a valid date that isn’t in the future.' },
  bad_month: { tone: 'warn', text: () => 'Choose a month to invoice.' },
  bad_email: { tone: 'warn', text: () => 'Enter a valid work email address.' },
  bad_role: { tone: 'warn', text: () => 'Choose a role.' },
  bad_licence: { tone: 'warn', text: () => 'Doctors and therapists need a licence number and expiry date.' },
  missing_name: { tone: 'warn', text: () => 'Enter the person’s full name.' },
  missing_reference: { tone: 'warn', text: () => 'Enter the bank transfer reference so it can be matched later.' },
  not_allowed: { tone: 'warn', text: () => 'Your role can’t make this change.' },
  member_not_found: { tone: 'warn', text: () => 'That member wasn’t found for this client.' },
  not_flex: { tone: 'warn', text: () => 'Only Flex Credits clients have credit to top up.' },
  invoice_exists: { tone: 'warn', text: () => 'This client already has an invoice for that month.' },
  invoice_not_found: { tone: 'warn', text: () => 'Invoice not found.' },
  not_draft: { tone: 'warn', text: () => 'Only invoices being prepared can be sent.' },
  not_sent: { tone: 'warn', text: () => 'This invoice hasn’t been sent, so it can’t be paid yet.' },
  overpayment: { tone: 'warn', text: () => 'That’s more than the amount still owed on this invoice.' },
  staff_exists: { tone: 'warn', text: () => 'Someone with this email is already on the team.' },
};

export function noticeFor(params: Record<string, string | string[] | undefined>): { tone: 'info' | 'warn'; text: string } | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const entry = NOTICES[one(params.notice) ?? ''];
  const n = one(params.n);
  return entry ? { tone: entry.tone, text: entry.text(n && /^\d{1,4}$/.test(n) ? n : undefined) } : null;
}
