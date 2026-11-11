import { lagosDate } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { BarChart, Kpi, Meter, PageHead } from '@/components/Widgets';
import { compactNaira, formatNumber, plural, PRICING_LABELS } from '@/lib/format';
import { eachDay, resolvePeriod, shortDay } from '@/lib/period';
import { portalContext, portalNav } from '@/lib/portal';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, data, client, contract, credit, nowIso } = await portalContext();
  const period = resolvePeriod(await searchParams, nowIso);
  const [consultations, counts] = await Promise.all([
    data.clientConsultations(client.id, period.from, period.to),
    data.memberCounts(client.id),
  ]);

  const total = consultations.length;
  const spent = consultations.reduce((s, c) => s + c.chargeKobo, 0);
  const uniqueMembers = new Set(consultations.map((c) => c.memberId)).size;
  const count = (pred: (c: (typeof consultations)[number]) => boolean) => consultations.filter(pred).length;
  const gpLike = count((c) => c.type === 'gp' || c.type === 'follow_up');
  const referrals = count((c) => c.outcome === 'referral');
  const outcomes = [
    { label: 'Resolved by a care coordinator', value: count((c) => c.type === 'coordinator_resolved') },
    { label: 'Treated by a GP, no referral', value: gpLike - count((c) => (c.type === 'gp' || c.type === 'follow_up') && c.outcome === 'referral') },
    { label: 'Prescriptions sent', value: count((c) => c.outcome === 'prescription') },
    { label: 'Lab tests ordered', value: count((c) => c.outcome === 'lab_test') },
    { label: 'Referred to a hospital in your network', value: referrals },
    { label: 'Therapy sessions', value: count((c) => c.type === 'therapy') },
  ];

  const perDay = new Map<string, number>();
  for (const c of consultations) {
    const d = lagosDate(c.occurredAt);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const bars = eachDay(period.from, period.to).map((d) => ({ label: shortDay(d), value: perDay.get(d) ?? 0 }));

  return (
    <Shell product="Client portal" clientName={client.name} user={user} nav={portalNav(user)} active="dashboard">
      <PageHead title="Dashboard" subtitle={`Showing ${period.label} · ${PRICING_LABELS[contract.pricingModel]} plan`}>
        <PeriodPicker period={period} basePath="/portal" />
      </PageHead>

      {credit?.low && (
        <div className="banner warn" role="status">
          <span className="grow">
            <b>Credit is running low.</b> {compactNaira(credit.balanceKobo)} left today
            {credit.daysLeft !== null && <>, about {plural(credit.daysLeft, 'day')} at your current rate of use</>}. Top up to avoid interruptions.
          </span>
          <a className="btn btn-primary btn-small" href="/portal/billing">
            Top up credit
          </a>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Active members" value={formatNumber(counts.active)} note={`${formatNumber(counts.suspended)} suspended`} />
        <Kpi label="Consultations" value={formatNumber(total)} note={`${formatNumber(uniqueMembers)} different members`} />
        <Kpi
          label={contract.pricingModel === 'unlimited' ? 'Usage charges' : 'Spent'}
          value={compactNaira(spent)}
          note={contract.pricingModel === 'flex' ? 'from your credit' : contract.pricingModel === 'unlimited' ? 'included in your plan' : 'excluding VAT and platform fee'}
        />
        {credit && <Kpi label="Credit left today" value={compactNaira(credit.balanceKobo)} note={credit.daysLeft !== null ? `about ${plural(credit.daysLeft, 'day')}` : undefined} tone={credit.low ? 'warn' : undefined} />}
        <Kpi label="Referred to hospital" value={formatNumber(referrals)} note={total ? `${Math.round((referrals / total) * 100)}% of consultations` : undefined} />
      </div>

      <div className="grid-main-side">
        <section className="card">
          <h2>Consultations per day</h2>
          <BarChart label="Your members’ consultations per day" bars={bars} />
        </section>
        <section className="card">
          <h2>What happened after the call</h2>
          {outcomes.map((o) => (
            <Meter key={o.label} label={o.label} value={formatNumber(o.value)} share={total ? o.value / total : 0} />
          ))}
          <span className="small muted">Of {formatNumber(total)} consultations. Clinical notes are not shared with the portal.</span>
        </section>
      </div>
    </Shell>
  );
}
