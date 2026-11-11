import { lagosDate, type ConsultationType } from '@hc247/core';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Kpi, PageHead } from '@/components/Widgets';
import { compactNaira, formatNaira, formatNumber, plural, PRICING_LABELS, TYPE_LABELS } from '@/lib/format';
import { formatRange, resolvePeriod, shortDay } from '@/lib/period';
import { portalContext, portalNav } from '@/lib/portal';
import { canSeeInvoices } from '@/lib/session';
import type { LedgerRow } from '@/lib/data/types';
import { invoiceBadge, owedKobo } from '@/lib/billing';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LEDGER_LABELS: Record<LedgerRow['kind'], string> = {
  opening: 'Opening balance',
  topup: 'Top-up received',
  usage: 'Usage',
  adjustment: 'Adjustment',
};

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, data, client, contract, credit, nowIso } = await portalContext();
  if (!canSeeInvoices(user)) redirect('/portal');
  const period = resolvePeriod(await searchParams, nowIso);
  const today = lagosDate(nowIso);

  const rateRows = (Object.entries(contract.rates) as Array<[ConsultationType, number]>).map(([t, r]) => ({ label: TYPE_LABELS[t], value: formatNaira(r) }));
  if (contract.pricingModel === 'payg') rateRows.unshift({ label: 'Monthly platform fee', value: formatNaira(contract.platformFeeKobo) });
  if (contract.pricingModel === 'unlimited') {
    rateRows.push({ label: 'Per member per month', value: formatNaira(contract.pmpmKobo) });
    rateRows.push({
      label: 'Therapy add-on, per member per month',
      value: contract.therapyAddonPmpmKobo === null ? 'Not in your plan' : formatNaira(contract.therapyAddonPmpmKobo),
    });
  }

  let ledgerRows: Array<LedgerRow & { balanceAfter: number }> = [];
  if (credit) {
    const ledger = (await data.creditLedger(client.id)).slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    let running = 0;
    const withBalance = ledger.map((e) => ({ ...e, balanceAfter: (running += e.amountKobo) }));
    ledgerRows = withBalance
      .filter((e) => {
        const d = lagosDate(e.occurredAt);
        return d >= period.from && d <= period.to;
      })
      .reverse();
  }
  const invoices = credit ? [] : await data.invoices(client.id);

  return (
    <Shell product="Client portal" clientName={client.name} user={user} nav={portalNav(user)} active="billing">
      <PageHead title="Billing and credit" subtitle={`${PRICING_LABELS[contract.pricingModel]} plan · contract ${formatRange(contract.startsOn, contract.endsOn)} · amounts excluding VAT unless stated`} />

      <div className="grid-main-side" style={{ gridTemplateColumns: '400px minmax(0, 1fr)' }}>
        <div className="stack" style={{ gap: 16 }}>
          {credit ? (
            <section className="card dark">
              <span className="eyebrow">Credit balance today</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 600, lineHeight: 1 }}>{formatNaira(credit.balanceKobo)}</span>
              <span className="small" style={{ color: 'var(--on-dark-muted)' }}>
                {credit.daysLeft !== null
                  ? `About ${plural(credit.daysLeft, 'day')} at your recent rate of use (${compactNaira(credit.dailyUsageKobo)} a day)`
                  : 'No usage in the last 7 days'}
              </span>
              <span className="small" style={{ color: 'var(--on-dark-muted)' }}>
                To top up, ask your account manager for an invoice or transfer details. Credit is added when the payment arrives and stays valid for 12 months.
              </span>
            </section>
          ) : (
            <div className="kpis" style={{ gridTemplateColumns: '1fr' }}>
              <Kpi
                label="Owed today"
                value={compactNaira(invoices.reduce((s, i) => s + owedKobo(i), 0))}
                note="Including VAT"
              />
            </div>
          )}
          <section className="card">
            <span className="eyebrow">Your contract rates</span>
            {rateRows.map((r) => (
              <div key={r.label} className="row-between">
                <span>{r.label}</span>
                <b>{r.value}</b>
              </div>
            ))}
          </section>
        </div>

        {credit ? (
          <section className="card flush">
            <div className="card-head">
              <h2>Credit history</h2>
              <PeriodPicker period={period} basePath="/portal/billing" />
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th className="num">Amount</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((e, i) => (
                    <tr key={`${e.occurredAt}-${i}`}>
                      <td>{shortDay(lagosDate(e.occurredAt))}</td>
                      <td>
                        {e.kind === 'usage' ? `Usage · ${formatNumber(e.consultationCount ?? 0)} consultations` : e.note ?? LEDGER_LABELS[e.kind]}
                        {e.reference && <span className="muted"> · {e.reference}</span>}
                      </td>
                      <td className="num strong" style={{ color: e.amountKobo > 0 ? 'var(--teal-text)' : undefined }}>
                        {e.kind === 'opening' ? '' : `${e.amountKobo > 0 ? '+' : '−'}${formatNaira(Math.abs(e.amountKobo))}`}
                      </td>
                      <td className="num">{formatNaira(e.balanceAfter)}</td>
                    </tr>
                  ))}
                  {ledgerRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">No credit activity in {period.label}.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>Each day’s usage matches the consultations listed for that day.</span>
              <a href="/portal/consultations">See consultations</a>
            </div>
          </section>
        ) : (
          <section className="card flush">
            <div className="card-head">
              <h2>Invoices</h2>
            </div>
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
                  {invoices.map((inv) => {
                    const badge = invoiceBadge(inv, today);
                    return (
                      <tr key={inv.id}>
                        <td className="strong">{inv.number}</td>
                        <td>{formatRange(inv.periodStart, inv.periodEnd)}</td>
                        <td className="num strong">{formatNaira(inv.totalKobo)}</td>
                        <td><span className={`badge ${badge.tone}`}>{badge.text}</span></td>
                      </tr>
                    );
                  })}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">No invoices yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Shell>
  );
}
