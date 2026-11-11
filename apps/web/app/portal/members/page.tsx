import { maskPhone } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { PageHead } from '@/components/Widgets';
import type { MemberFilter } from '@/lib/data/types';
import { formatLagosDateTime, formatNumber } from '@/lib/format';
import { portalContext, portalNav } from '@/lib/portal';
import { uploadMembersAction } from './actions';
import { UploadForm } from './UploadForm';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 25;

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, data, client } = await portalContext();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter: MemberFilter = (['active', 'suspended', 'not_on_app'] as const).find((f) => f === one(params.filter)) ?? 'active';
  const query = one(params.q)?.slice(0, 80) ?? '';
  const page = Math.max(1, Number(one(params.page)) || 1);

  const [counts, result, lastImport] = await Promise.all([
    data.memberCounts(client.id),
    data.searchMembers(client.id, { filter, query, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
    data.lastMemberImport(client.id),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const link = (changes: Record<string, string | number>) => {
    const q = new URLSearchParams({ filter, ...(query ? { q: query } : {}), page: String(page) });
    for (const [k, v] of Object.entries(changes)) q.set(k, String(v));
    return `/portal/members?${q.toString()}`;
  };
  const tabs: Array<[MemberFilter, string, number]> = [
    ['active', 'Active', counts.active],
    ['suspended', 'Suspended', counts.suspended],
    ['not_on_app', 'Not on the app', counts.notOnApp],
  ];
  const isAdmin = user.role === 'client_admin';

  return (
    <Shell product="Client portal" clientName={client.name} user={user} nav={portalNav(user)} active="members">
      <PageHead title="Members" subtitle="Current list · members can use the service while active" />

      <div className="grid-main-side">
        <section className="card flush">
          <div className="card-head">
            <div className="tabs" role="group" aria-label="Show members">
              {tabs.map(([key, label, n]) => (
                <a key={key} href={link({ filter: key, page: 1 })} aria-current={filter === key ? 'true' : undefined}>
                  {label} · {formatNumber(n)}
                </a>
              ))}
            </div>
            <form method="get" action="/portal/members" className="filters">
              <input type="hidden" name="filter" value={filter} />
              <label htmlFor="member-search" className="small muted">
                Search
              </label>
              <input id="member-search" className="input" name="q" defaultValue={query} placeholder="Name, phone or member ID" />
            </form>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Member ID</th>
                  <th>Phone</th>
                  <th>Benefits</th>
                  <th>Uses</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((m) => (
                  <tr key={m.id}>
                    <td className="strong">{m.fullName}</td>
                    <td>{m.externalMemberId}</td>
                    <td>{maskPhone(m.phoneE164)}</td>
                    <td>{m.planCode ?? '—'}</td>
                    <td>{m.status === 'suspended' ? <span className="badge off">Suspended</span> : m.usesApp ? 'App' : 'Phone line'}</td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No members match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>
              Showing {result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, result.total)} of {formatNumber(result.total)}
            </span>
            <span className="pager">
              {page > 1 && <a href={link({ page: page - 1 })}>Previous</a>}
              {page < pages && <a href={link({ page: page + 1 })}>Next</a>}
            </span>
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <h2>Update your member list</h2>
            {isAdmin ? (
              <>
                <UploadForm action={uploadMembersAction} />
                <span className="small muted">
                  New members are added and existing ones updated. Members missing from the file are not removed automatically.
                  Columns needed: name, member ID and phone number; date of birth and plan are optional.
                </span>
              </>
            ) : (
              <span className="muted">Only your organisation’s portal admin can upload member lists.</span>
            )}
          </section>

          {lastImport && (
            <section className="card">
              <h2>Last upload · {formatLagosDateTime(lastImport.uploadedAt)}</h2>
              <span className="small muted">{lastImport.filename} · {formatNumber(lastImport.rowsTotal)} rows</span>
              <div className="row-between"><span>Added</span><b>{formatNumber(lastImport.added)}</b></div>
              <div className="row-between"><span>Updated</span><b>{formatNumber(lastImport.updated)}</b></div>
              <div className="row-between" style={{ color: lastImport.errors.length ? 'var(--amber-text)' : undefined }}>
                <span>Need fixing</span>
                <b>{formatNumber(lastImport.errors.length)}</b>
              </div>
              {lastImport.errors.length > 0 && (
                <table className="data">
                  <thead>
                    <tr><th>Row</th><th>Problem</th></tr>
                  </thead>
                  <tbody>
                    {lastImport.errors.slice(0, 20).map((e) => (
                      <tr key={e.row}>
                        <td>{e.row}</td>
                        <td>
                          <span className="strong">{e.name}</span>
                          <br />
                          <span style={{ color: 'var(--amber-text)' }}>{e.problem}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
