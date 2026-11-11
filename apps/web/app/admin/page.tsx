import { lagosDate } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { BarChart, Kpi, PageHead } from '@/components/Widgets';
import { ADMIN_NAV, clientSummaries, daysUntil } from '@/lib/admin';
import { getData, now } from '@/lib/data';
import { compactNaira, formatNumber, plural, PRICING_LABELS } from '@/lib/format';
import { eachDay, periodQuery, resolvePeriod, shortDay } from '@/lib/period';
import { requireStaff } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOverview({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const nowIso = now();
  const today = lagosDate(nowIso);
  const period = resolvePeriod(await searchParams, nowIso);
  const summaries = await clientSummaries(getData(), period.from, period.to, nowIso);

  const all = summaries.flatMap((s) => s.consultations);
  const perDay = new Map<string, number>();
  for (const c of all) {
    const d = lagosDate(c.occurredAt);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const bars = eachDay(period.from, period.to).map((d) => ({ label: shortDay(d), value: perDay.get(d) ?? 0 }));
  const owed = summaries.reduce((s, c) => s + c.owedKobo, 0);
  const owedInvoices = summaries.reduce((n, c) => n + c.invoices.filter((i) => i.status === 'sent' || i.status === 'part_paid').length, 0);

  const alerts: Array<{ title: string; detail: string; href: string; action: string; warn: boolean }> = [];
  for (const s of summaries) {
    if (s.lowCredit && s.creditKobo !== null) {
      alerts.push({
        title: `${s.client.name} credit balance is low`,
        detail: `${compactNaira(s.creditKobo)} left${s.creditDaysLeft !== null ? ` · about ${plural(s.creditDaysLeft, 'day')} of use` : ''}`,
        href: `/admin/clients/${s.client.id}`,
        action: 'Open client',
        warn: true,
      });
    }
    for (const inv of s.overdue) {
      alerts.push({
        title: `${s.client.name} invoice overdue ${daysUntil(today, inv.dueOn!) } days`,
        detail: `${inv.number} · ${compactNaira(inv.totalKobo - inv.paidKobo)} unpaid`,
        href: `/admin/clients/${s.client.id}`,
        action: 'Open client',
        warn: true,
      });
    }
    const ends = daysUntil(s.contract.endsOn, today);
    if (ends >= 0 && ends <= 60) {
      alerts.push({
        title: `${s.client.name} contract ends in ${ends} days`,
        detail: `${s.client.isPilot ? 'Pilot' : 'Contract'} ends ${shortDay(s.contract.endsOn)} · prepare the renewal`,
        href: `/admin/clients/${s.client.id}`,
        action: 'Open client',
        warn: false,
      });
    }
  }

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="overview">
      <PageHead title="Overview" subtitle={`Showing ${period.label} · amounts excluding VAT`}>
        <PeriodPicker period={period} basePath="/admin" />
      </PageHead>

      <div className="kpis">
        <Kpi label="Members covered" value={formatNumber(summaries.reduce((s, c) => s + c.members.active, 0))} note={`${summaries.length} clients`} />
        <Kpi label="Consultations" value={formatNumber(all.length)} note={period.label} />
        <Kpi label="Usage charges" value={compactNaira(all.reduce((s, c) => s + c.chargeKobo, 0))} note="Unlimited fees are billed monthly" />
        <Kpi label="Owed to us today" value={compactNaira(owed)} note={`${owedInvoices} invoices, incl. VAT`} tone={owed > 0 ? 'warn' : undefined} />
      </div>

      <div className="grid-main-side" style={{ gridTemplateColumns: 'minmax(0, 1fr) 520px' }}>
        <section className="card">
          <h2>Consultations per day</h2>
          <BarChart label="Consultations per day, all clients" bars={bars} />
        </section>
        <section className="card flush">
          <div className="card-head"><h2>By client</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="num">Members</th>
                  <th className="num">Consults</th>
                  <th className="num">Usage</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.client.id}>
                    <td>
                      <a className="strong" href={`/admin/clients/${s.client.id}?${periodQuery(period)}`} style={{ textDecoration: 'none' }}>{s.client.name}</a>
                      <br />
                      <span className="small muted">{PRICING_LABELS[s.contract.pricingModel]}{s.client.isPilot ? ' · pilot' : ''}</span>
                    </td>
                    <td className="num">{formatNumber(s.members.active)}</td>
                    <td className="num">{formatNumber(s.consultations.length)}</td>
                    <td className="num strong">{s.contract.pricingModel === 'unlimited' ? 'Included' : compactNaira(s.usageKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Needs attention today</h2>
        {alerts.length === 0 && <span className="muted">Nothing needs attention.</span>}
        <div className="grid-2" style={{ gap: 8 }}>
          {alerts.map((a) => (
            <div key={a.title} className={`banner ${a.warn ? 'warn' : 'info'}`}>
              <span className="grow">
                <b>{a.title}</b>
                <br />
                <span className="small">{a.detail}</span>
              </span>
              <a className="btn btn-small" href={a.href}>{a.action}</a>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
