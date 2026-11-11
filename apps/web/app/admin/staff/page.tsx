import { lagosDate } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/Notice';
import { Kpi, PageHead } from '@/components/Widgets';
import { inviteStaffAction } from '@/app/admin/actions';
import { ADMIN_NAV, daysUntil } from '@/lib/admin';
import { getData, now } from '@/lib/data';
import type { StaffMember, StaffRole } from '@/lib/data/types';
import { LANGUAGE_LABELS, plural } from '@/lib/format';
import { shortDay } from '@/lib/period';
import { can, requireStaff } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROLE_LABELS: Record<StaffRole, string> = {
  ops_admin: 'Operations admin',
  finance: 'Finance',
  clinical_lead: 'Clinical lead',
  gp: 'GP',
  therapist: 'Therapist',
  coordinator: 'Care coordinator',
};

const ROLE_ACCESS: Array<[StaffRole, string]> = [
  ['coordinator', 'Call queue, check-in calls and member cover. No clinical notes or therapy records.'],
  ['gp', 'Patients they treat, readings and prescriptions. No therapy records.'],
  ['therapist', 'Therapy sessions and their own notes only.'],
  ['clinical_lead', 'All consultations; reviews emergency access and prescribing.'],
  ['ops_admin', 'Clients, members, staff and top-ups. No health records.'],
  ['finance', 'Invoices, payments and top-ups. No health records.'],
];

function licenceBadge(m: StaffMember, today: string): { tone: string; text: string } {
  if (!m.licenceExpiresOn) return { tone: 'off', text: 'Not required' };
  const days = daysUntil(m.licenceExpiresOn, today);
  const when = `${shortDay(m.licenceExpiresOn)} ${m.licenceExpiresOn.slice(0, 4)}`;
  if (days < 0) return { tone: 'warn', text: `Expired ${when}` };
  if (days <= 30) return { tone: 'warn', text: `Expires ${when}` };
  return { tone: 'ok', text: `Valid to ${when}` };
}

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const params = await searchParams;
  const today = lagosDate(now());
  const staff = await getData().listStaff();
  const roleFilter = (Object.keys(ROLE_LABELS) as StaffRole[]).find((r) => r === (Array.isArray(params.role) ? params.role[0] : params.role));
  const shown = staff.filter((m) => !roleFilter || m.role === roleFilter);
  const expiring = staff.filter((m) => m.licenceExpiresOn && daysUntil(m.licenceExpiresOn, today) <= 30);
  const count = (roles: StaffRole[]) => staff.filter((m) => roles.includes(m.role) && m.status !== 'disabled').length;

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="staff">
      <PageHead title="Staff" subtitle="Your team’s accounts, roles and licences" />
      <Notice params={params} />

      <div className="kpis">
        <Kpi label="Doctors" value={String(count(['gp', 'clinical_lead']))} />
        <Kpi label="Therapists" value={String(count(['therapist']))} />
        <Kpi label="Care coordinators" value={String(count(['coordinator']))} />
        <Kpi
          label="Licences expired or expiring in 30 days"
          value={String(expiring.length)}
          note={expiring.length ? 'They must renew before their next shift' : 'All current'}
          tone={expiring.length ? 'warn' : undefined}
        />
      </div>

      {expiring.length > 0 && (
        <div className="banner warn" role="status">
          <span className="grow">
            <b>Check these licences:</b> {expiring.map((m) => m.fullName).join(', ')}. Ask for proof of renewal before their next shift.
          </span>
        </div>
      )}

      <div className="grid-main-side">
        <section className="card flush">
          <div className="card-head">
            <h2>Team</h2>
            <div className="tabs" role="group" aria-label="Filter by role">
              <a href="/admin/staff" aria-current={!roleFilter ? 'true' : undefined}>All · {staff.length}</a>
              {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                <a key={r} href={`/admin/staff?role=${r}`} aria-current={roleFilter === r ? 'true' : undefined}>
                  {ROLE_LABELS[r]}
                </a>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Languages</th>
                  <th>Licence</th>
                  <th>Account</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const lb = licenceBadge(m, today);
                  return (
                    <tr key={m.id}>
                      <td>
                        <span className="strong">{m.fullName}</span>
                        <br />
                        <span className="muted">{m.email}</span>
                      </td>
                      <td>{ROLE_LABELS[m.role]}</td>
                      <td>{m.languages.map((l) => LANGUAGE_LABELS[l]).join(', ')}</td>
                      <td>
                        <span className={`badge ${lb.tone}`}>{lb.text}</span>
                        {m.licenceNumber && <><br /><span className="small muted">{m.licenceNumber}</span></>}
                      </td>
                      <td>{m.status === 'invited' ? <span className="badge info">Invited</span> : m.status === 'disabled' ? <span className="badge off">Disabled</span> : 'Active'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          {can.manageStaff(user) && (
            <section className="card">
              <h2>Invite a team member</h2>
              <form action={inviteStaffAction} className="stack" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <input id="fullName" className="input" name="fullName" required maxLength={100} />
                </div>
                <div className="field">
                  <label htmlFor="email">Work email</label>
                  <input id="email" className="input" type="email" name="email" required maxLength={200} />
                </div>
                <div className="field">
                  <label htmlFor="role">Role</label>
                  <select id="role" className="input" name="role" required defaultValue="">
                    <option value="" disabled>Choose a role</option>
                    {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="strong" style={{ fontSize: 13, marginBottom: 6 }}>Languages they can consult in</legend>
                  <div className="filters">
                    {(['english', 'yoruba', 'igbo', 'hausa'] as const).map((l) => (
                      <label key={l} className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" name="languages" value={l} defaultChecked={l === 'english'} />
                        {LANGUAGE_LABELS[l]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field">
                  <label htmlFor="licenceNumber">Licence number <span className="muted">(doctors and therapists)</span></label>
                  <input id="licenceNumber" className="input" name="licenceNumber" maxLength={60} placeholder="MDCN/…" />
                </div>
                <div className="field">
                  <label htmlFor="licenceExpiresOn">Licence expiry</label>
                  <input id="licenceExpiresOn" className="input" type="date" name="licenceExpiresOn" />
                </div>
                <button className="btn btn-primary" type="submit">Send invitation</button>
              </form>
            </section>
          )}
          <section className="card">
            <h2>Roles and what they can see</h2>
            {ROLE_ACCESS.map(([role, text]) => (
              <div key={role} className="stack" style={{ gap: 2, paddingBottom: 8, borderBottom: '1px solid var(--line-soft)' }}>
                <span className="strong">{ROLE_LABELS[role]}</span>
                <span className="small muted">{text}</span>
              </div>
            ))}
            <span className="small muted">{plural(staff.length, 'account')} in total. The database enforces these rules, not just this page.</span>
          </section>
        </div>
      </div>
    </Shell>
  );
}
