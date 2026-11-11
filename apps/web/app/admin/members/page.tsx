import { maskPhone } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/Notice';
import { PageHead } from '@/components/Widgets';
import { UploadForm } from '@/app/portal/members/UploadForm';
import { setMemberStatusAction, uploadMembersForClientAction } from '@/app/admin/actions';
import { ADMIN_NAV } from '@/lib/admin';
import { getData } from '@/lib/data';
import type { MemberFilter } from '@/lib/data/types';
import { formatLagosDateTime, formatNumber } from '@/lib/format';
import { can, requireStaff } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 25;

export default async function AdminMembersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const data = getData();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const clients = await data.listClients();
  const client = clients.find((c) => c.id === one(params.client)) ?? clients[0]!;
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
    const q = new URLSearchParams({ client: client.id, filter, ...(query ? { q: query } : {}), page: String(page) });
    for (const [k, v] of Object.entries(changes)) q.set(k, String(v));
    return `/admin/members?${q.toString()}`;
  };
  const here = link({});
  const editable = can.manageMembers(user);

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="members">
      <PageHead title="Members" subtitle={`${client.name} · current list`}>
        <form method="get" action="/admin/members" className="filters">
          <label htmlFor="client" className="small muted">Client</label>
          <select id="client" name="client" className="input" defaultValue={client.id}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn btn-small" type="submit">Show</button>
        </form>
      </PageHead>
      <Notice params={params} />

      <div className="grid-main-side">
        <section className="card flush">
          <div className="card-head">
            <div className="tabs" role="group" aria-label="Show members">
              {([['active', 'Active', counts.active], ['suspended', 'Suspended', counts.suspended], ['not_on_app', 'Not on the app', counts.notOnApp]] as const).map(([key, label, n]) => (
                <a key={key} href={link({ filter: key, page: 1 })} aria-current={filter === key ? 'true' : undefined}>
                  {label} · {formatNumber(n)}
                </a>
              ))}
            </div>
            <form method="get" action="/admin/members" className="filters">
              <input type="hidden" name="client" value={client.id} />
              <input type="hidden" name="filter" value={filter} />
              <label htmlFor="q" className="small muted">Search</label>
              <input id="q" className="input" name="q" defaultValue={query} placeholder="Name, phone or member ID" />
            </form>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Member ID</th>
                  <th>Phone</th>
                  <th>Plan</th>
                  <th>Uses</th>
                  {editable && <th className="num">Action</th>}
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
                    {editable && (
                      <td className="num">
                        <form action={setMemberStatusAction}>
                          <input type="hidden" name="clientId" value={client.id} />
                          <input type="hidden" name="memberId" value={m.id} />
                          <input type="hidden" name="status" value={m.status === 'active' ? 'suspended' : 'active'} />
                          <input type="hidden" name="back" value={here} />
                          <button className="btn btn-small" type="submit" aria-label={`${m.status === 'active' ? 'Suspend' : 'Reactivate'} ${m.fullName}`}>
                            {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 6 : 5} className="muted">No members match.</td>
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
            <h2>Upload for {client.name}</h2>
            {editable ? (
              <>
                <UploadForm action={uploadMembersForClientAction} clientId={client.id} />
                <span className="small muted">For clients who send their list by email. Clients can also upload it themselves in their portal.</span>
              </>
            ) : (
              <span className="muted">Only operations admins can upload member lists.</span>
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
              {lastImport.errors.slice(0, 10).map((e) => (
                <div key={e.row} className="small">
                  <b>Row {e.row}</b> · {e.name}: <span style={{ color: 'var(--amber-text)' }}>{e.problem}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
