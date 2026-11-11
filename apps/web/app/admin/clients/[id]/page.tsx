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
import { requireStaff } from '@/lib/session';

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
  const period = resolvePeriod(await searchParams, nowIso);
  const summary = (await clientSummaries(data, period.from, period.to, nowIso)).find((s) => s.client.id === id)!;
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
    </Shell>
  );
}
