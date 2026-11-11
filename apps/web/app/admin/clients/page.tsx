import { lagosDate } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PageHead } from '@/components/Widgets';
import { ADMIN_NAV, clientSummaries, type ClientSummary } from '@/lib/admin';
import { getData, now } from '@/lib/data';
import { compactNaira, formatNumber, PRICING_LABELS } from '@/lib/format';
import { periodQuery, resolvePeriod, shortDay } from '@/lib/period';
import { requireStaff } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function billingStatus(s: ClientSummary): { tone: string; text: string } {
  if (s.creditKobo !== null) {
    return s.lowCredit ? { tone: 'warn', text: `Credit low · ${compactNaira(s.creditKobo)}` } : { tone: 'ok', text: `Credit ${compactNaira(s.creditKobo)}` };
  }
  if (s.overdue.length > 0) return { tone: 'warn', text: `Overdue · ${compactNaira(s.owedKobo)}` };
  if (s.owedKobo > 0) return { tone: 'info', text: `${compactNaira(s.owedKobo)} due` };
  return { tone: 'ok', text: 'Paid up' };
}

const TYPE_NAMES = { hmo: 'HMO', government: 'Government', employer: 'Employer' } as const;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const nowIso = now();
  const period = resolvePeriod(await searchParams, nowIso);
  const summaries = await clientSummaries(getData(), period.from, period.to, nowIso);
  const today = lagosDate(nowIso);

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="clients">
      <PageHead title="Clients" subtitle={`Consultations for ${period.label}; billing status as of today`}>
        <PeriodPicker period={period} basePath="/admin/clients" />
      </PageHead>
      <section className="card flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Pricing</th>
                <th className="num">Members</th>
                <th className="num">Consultations</th>
                <th>Billing</th>
                <th>Contract ends</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const badge = billingStatus(s);
                return (
                  <tr key={s.client.id}>
                    <td>
                      <a className="strong" href={`/admin/clients/${s.client.id}?${periodQuery(period)}`} style={{ textDecoration: 'none', fontSize: 14 }}>{s.client.name}</a>
                      <br />
                      <span className="muted">{TYPE_NAMES[s.client.type]}{s.client.isPilot ? ' · pilot' : ''}</span>
                    </td>
                    <td>{PRICING_LABELS[s.contract.pricingModel]}</td>
                    <td className="num">{formatNumber(s.members.active)}</td>
                    <td className="num">{formatNumber(s.consultations.length)}</td>
                    <td><span className={`badge ${badge.tone}`}>{badge.text}</span></td>
                    <td>
                      {shortDay(s.contract.endsOn)} {s.contract.endsOn.slice(0, 4)}
                      {s.contract.endsOn < today && <span className="badge warn"> Ended</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
