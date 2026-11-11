import { lagosDate, usageByType, type ConsultationType } from '@hc247/core';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Kpi, PageHead } from '@/components/Widgets';
import { ADMIN_NAV, clientSummaries } from '@/lib/admin';
import { invoiceBadge } from '@/lib/billing';
import { getData, now } from '@/lib/data';
import { compactNaira, formatNaira, formatNumber, plural, PRICING_LABELS, TYPE_LABELS } from '@/lib/format';
import { formatRange, resolvePeriod } from '@/lib/period';
import { can, requireStaff, type SessionUser } from '@/lib/session';
import { Notice } from '@/components/Notice';
import { setEmrNamesAction } from '@/app/admin/actions';
import type { Client } from '@/lib/data/types';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ClientDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireStaff();
  const { id } = await params;
  const data = getData();
  const client = await data.getClient(id);
  if (!client) notFound();
  const nowIso = now();
  const today = lagosDate(nowIso);
  const query = await searchParams;
  const period = resolvePeriod(query, nowIso);
  const summary = (await clientSummaries(data, period.from, period.to, nowIso)).find((s) => s.client.id === id);
  if (!summary) {
    return (
      <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="clients">
        <div className="small"><a href="/admin/clients">Clients</a> / {client.name}</div>
        <PageHead title={client.name} subtitle="No contract yet" />
        <Notice params={query} />
        <p className="banner info">This client has no contract yet, so there’s no usage or billing to show.</p>
        <EmrNames client={client} user={user} />
      </Shell>
    );
  }
  const { contract } = summary;
  const usage = usageByType(summary.consultations);
  const rate = (t: ConsultationType) => contract.rates[t];

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="clients">
      <div className="small"><a href="/admin/clients">Clients</a> / {client.name}</div>
      <PageHead
        title={client.name}
        subtitle={`${PRICING_LABELS[contract.pricingModel]}${client.isPilot ? ' pilot' : ''} · contract ${formatRange(contract.startsOn, contract.endsOn)} · usage for ${period.label}`}
      >
        <PeriodPicker period={period} basePath={`/admin/clients/${id}`} />
      </PageHead>
      <Notice params={query} />

      <div className="kpis">
        {summary.creditKobo !== null && (
          <Kpi
            label="Credit balance today"
            value={compactNaira(summary.creditKobo)}
            note={summary.creditDaysLeft !== null ? `about ${plural(summary.creditDaysLeft, 'day')} of use` : undefined}
            tone={summary.lowCredit ? 'warn' : undefined}
          />
        )}
        <Kpi label="Active members" value={formatNumber(summary.members.active)} note={`${formatNumber(summary.members.suspended)} suspended · ${formatNumber(summary.members.notOnApp)} not on the app`} />
        <Kpi label="Consultations" value={formatNumber(summary.consultations.length)} note={period.label} />
        <Kpi label={contract.pricingModel === 'unlimited' ? 'Monthly fee' : 'Usage charges'} value={contract.pricingModel === 'unlimited' ? compactNaira(summary.members.active * contract.pmpmKobo) : compactNaira(summary.usageKobo)} note={contract.pricingModel === 'unlimited' ? `${formatNumber(summary.members.active)} × ${formatNaira(contract.pmpmKobo)}` : 'excluding VAT'} />
        {summary.creditKobo === null && <Kpi label="Owed today" value={compactNaira(summary.owedKobo)} note="including VAT" tone={summary.overdue.length ? 'warn' : undefined} />}
      </div>

      <div className="grid-2">
        <section className="card flush">
          <div className="card-head"><h2>Usage · {period.label}</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="num">Count</th>
                  <th className="num">Rate</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.type}>
                    <td>{TYPE_LABELS[u.type]}</td>
                    <td className="num">{formatNumber(u.count)}</td>
                    <td className="num">{rate(u.type) !== undefined ? formatNaira(rate(u.type)!) : 'Included'}</td>
                    <td className="num strong">{contract.pricingModel === 'unlimited' ? '—' : formatNaira(u.totalKobo)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="strong">Total</td>
                  <td className="num strong">{formatNumber(summary.consultations.length)}</td>
                  <td />
                  <td className="num strong">{contract.pricingModel === 'unlimited' ? '—' : formatNaira(summary.usageKobo)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card flush">
          <div className="card-head"><h2>Invoices</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Period</th>
                  <th className="num">Total incl. VAT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.invoices.map((inv) => {
                  const b = invoiceBadge(inv, today);
                  return (
                    <tr key={inv.id}>
                      <td className="strong">{inv.number}</td>
                      <td>{formatRange(inv.periodStart, inv.periodEnd)}</td>
                      <td className="num">{formatNaira(inv.totalKobo)}</td>
                      <td><span className={`badge ${b.tone}`}>{b.text}</span></td>
                    </tr>
                  );
                })}
                {summary.invoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">{contract.pricingModel === 'flex' ? 'Flex clients pay through credit top-ups.' : 'No invoices yet.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <EmrNames client={client} user={user} />
    </Shell>
  );
}

/** The names this client goes by in the EMR export, used to match imported consultations. */
function EmrNames({ client, user }: { client: Client; user: SessionUser }) {
  return (
    <section className="card stack" style={{ gap: 10, marginTop: 16, maxWidth: 560 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Names in the EMR</h2>
      <p className="small muted" style={{ margin: 0 }}>
        How this client appears in the EMR export’s service column. Consultations are matched to the client by these names.
      </p>
      {can.manageMembers(user) ? (
        <form action={setEmrNamesAction} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="back" value={`/admin/clients/${client.id}`} />
          <div className="field">
            <label htmlFor="emr-names">Names, separated by commas</label>
            <input id="emr-names" className="input" name="names" defaultValue={client.emrNames.join(', ')} maxLength={500} />
          </div>
          <button className="btn btn-small" type="submit">Save names</button>
        </form>
      ) : (
        <p className="strong" style={{ margin: 0 }}>{client.emrNames.length ? client.emrNames.join(', ') : 'None yet'}</p>
      )}
    </section>
  );
}
