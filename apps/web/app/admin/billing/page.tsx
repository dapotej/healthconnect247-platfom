import { lagosDate } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/Notice';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Kpi, PageHead } from '@/components/Widgets';
import { createInvoiceDraftsAction, recordTopUpAction } from '@/app/admin/actions';
import { ADMIN_NAV, clientSummaries } from '@/lib/admin';
import { collectedBetween, invoiceBadge, invoicedBetween, isOverdue, owedKobo } from '@/lib/billing';
import { getData, now } from '@/lib/data';
import { compactNaira, formatNaira, plural } from '@/lib/format';
import { formatRange, periodQuery, resolvePeriod } from '@/lib/period';
import { can, requireStaff } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type StatusFilter = 'all' | 'outstanding' | 'overdue' | 'draft';

export default async function AdminBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const params = await searchParams;
  const nowIso = now();
  const today = lagosDate(nowIso);
  const period = resolvePeriod(params, nowIso);
  const data = getData();
  const [invoices, summaries] = await Promise.all([data.invoices(), clientSummaries(data, period.from, period.to, nowIso)]);
  const clientName = new Map(summaries.map((s) => [s.client.id, s.client.name]));

  const status = (['all', 'outstanding', 'overdue', 'draft'] as const).find((s) => s === (Array.isArray(params.status) ? params.status[0] : params.status)) ?? 'all';
  const shown = invoices.filter((i) =>
    status === 'all' ? true : status === 'draft' ? i.status === 'draft' : status === 'overdue' ? isOverdue(i, today) : owedKobo(i) > 0,
  );
  const counts: Record<StatusFilter, number> = {
    all: invoices.length,
    outstanding: invoices.filter((i) => owedKobo(i) > 0).length,
    overdue: invoices.filter((i) => isOverdue(i, today)).length,
    draft: invoices.filter((i) => i.status === 'draft').length,
  };
  const flex = summaries.filter((s) => s.creditKobo !== null);
  const here = `/admin/billing?${periodQuery(period)}&status=${status}`;

  // Months finance can invoice: this month and the two before it.
  const [y, m] = today.split('-').map(Number) as [number, number];
  const months = [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(y, m - 1 - back, 1));
    return { value: d.toISOString().slice(0, 7), label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="billing">
      <PageHead title="Billing" subtitle={`Showing ${period.label} · amounts include VAT unless stated`}>
        {can.manageInvoices(user) && (
          <form action={createInvoiceDraftsAction} className="filters">
            <input type="hidden" name="back" value={here} />
            <label htmlFor="month" className="small muted">Invoice usage for</label>
            <select id="month" name="month" className="input" defaultValue={months[1]!.value}>
              {months.map((mo) => (
                <option key={mo.value} value={mo.value}>{mo.label}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-small" type="submit">Create invoices</button>
          </form>
        )}
      </PageHead>
      <Notice params={params} />
      <div className="toolbar">
        <PeriodPicker period={period} basePath="/admin/billing" keep={{ status }} />
        <span className="small muted">Owed and credit figures are always as of today.</span>
      </div>

      <div className="kpis">
        <Kpi label="Invoiced in period" value={compactNaira(invoicedBetween(invoices, period.from, period.to).reduce((s, i) => s + i.totalKobo, 0))} note="by billing month" />
        <Kpi label="Collected in period" value={compactNaira(collectedBetween(invoices, period.from, period.to))} note="invoice payments received" />
        <Kpi label="Owed today" value={compactNaira(invoices.reduce((s, i) => s + owedKobo(i), 0))} note={plural(counts.outstanding, 'invoice')} />
        <Kpi
          label="Overdue today"
          value={compactNaira(invoices.filter((i) => isOverdue(i, today)).reduce((s, i) => s + owedKobo(i), 0))}
          note={plural(counts.overdue, 'invoice')}
          tone={counts.overdue ? 'warn' : undefined}
        />
        <Kpi label="Flex credit held today" value={compactNaira(flex.reduce((s, f) => s + (f.creditKobo ?? 0), 0))} note={plural(flex.length, 'client')} />
      </div>

      <div className="grid-main-side">
        <section className="card flush">
          <div className="card-head">
            <h2>Invoices</h2>
            <div className="tabs" role="group" aria-label="Show invoices">
              {([['all', 'All'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'], ['draft', 'Being prepared']] as const).map(([key, label]) => (
                <a key={key} href={`/admin/billing?${periodQuery(period)}&status=${key}`} aria-current={status === key ? 'true' : undefined}>
                  {label} · {counts[key]}
                </a>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Billing month</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((inv) => {
                  const b = invoiceBadge(inv, today);
                  return (
                    <tr key={inv.id}>
                      <td><a className="strong" href={`/admin/billing/invoices/${inv.id}`}>{inv.number}</a></td>
                      <td>{clientName.get(inv.clientId) ?? inv.clientId}</td>
                      <td>{formatRange(inv.periodStart, inv.periodEnd)}</td>
                      <td className="num strong">{formatNaira(inv.totalKobo)}</td>
                      <td><span className={`badge ${b.tone}`}>{b.text}</span></td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="muted">No invoices to show.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>Open an invoice to see its lines, send it or record a payment.</span>
          </div>
        </section>

        <section className="card">
          <h2>Flex credit</h2>
          {flex.map((f) => (
            <div key={f.client.id} className="stack" style={{ gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
              <div className="row-between">
                <a className="strong" href={`/admin/clients/${f.client.id}`}>{f.client.name}</a>
                <span className={f.lowCredit ? 'strong' : undefined} style={{ color: f.lowCredit ? 'var(--amber-text)' : undefined }}>
                  {formatNaira(f.creditKobo ?? 0)}{f.lowCredit ? ' · low' : ''}
                </span>
              </div>
              {f.creditDaysLeft !== null && <span className="small muted">About {plural(f.creditDaysLeft, 'day')} at recent usage</span>}
              {can.recordTopUps(user) && (
                <details>
                  <summary className="small strong" style={{ cursor: 'pointer', color: 'var(--blue)' }}>Record a top-up</summary>
                  <form action={recordTopUpAction} className="stack" style={{ gap: 8, marginTop: 8 }}>
                    <input type="hidden" name="clientId" value={f.client.id} />
                    <input type="hidden" name="back" value={here} />
                    <div className="field">
                      <label htmlFor={`amt-${f.client.id}`}>Amount received (₦)</label>
                      <input id={`amt-${f.client.id}`} className="input" name="amount" inputMode="decimal" placeholder="5,000,000" required />
                    </div>
                    <div className="field">
                      <label htmlFor={`on-${f.client.id}`}>Date received</label>
                      <input id={`on-${f.client.id}`} className="input" type="date" name="receivedOn" defaultValue={today} max={today} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`ref-${f.client.id}`}>Bank transfer reference</label>
                      <input id={`ref-${f.client.id}`} className="input" name="reference" maxLength={80} required />
                    </div>
                    <button className="btn btn-primary btn-small" type="submit">Add credit</button>
                  </form>
                </details>
              )}
            </div>
          ))}
          <span className="small muted">Credit is added as soon as a top-up is recorded. Only record money that has arrived in the bank.</span>
        </section>
      </div>
    </Shell>
  );
}
