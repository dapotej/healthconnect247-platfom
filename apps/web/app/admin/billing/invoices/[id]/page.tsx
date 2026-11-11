import { lagosDate } from '@hc247/core';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/Notice';
import { PageHead } from '@/components/Widgets';
import { recordPaymentAction, sendInvoiceAction } from '@/app/admin/actions';
import { ADMIN_NAV } from '@/lib/admin';
import { invoiceBadge, owedKobo } from '@/lib/billing';
import { getData, now } from '@/lib/data';
import { formatNaira, formatNumber } from '@/lib/format';
import { formatRange, shortDay } from '@/lib/period';
import { can, requireStaff } from '@/lib/session';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InvoicePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireStaff();
  const { id } = await params;
  const data = getData();
  const inv = await data.getInvoice(id);
  if (!inv) notFound();
  const client = await data.getClient(inv.clientId);
  const today = lagosDate(now());
  const badge = invoiceBadge(inv, today);
  const here = `/admin/billing/invoices/${inv.id}`;
  const owed = owedKobo(inv);
  const finance = can.manageInvoices(user);

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="billing">
      <div className="small"><a href="/admin/billing">Billing</a> / {inv.number}</div>
      <PageHead title={`${inv.number} · ${client?.name ?? inv.clientId}`} subtitle={`Billing month ${formatRange(inv.periodStart, inv.periodEnd)}`}>
        <span className={`badge ${badge.tone}`} style={{ fontSize: 13 }}>{badge.text}</span>
      </PageHead>
      <Notice params={await searchParams} />

      <div className="grid-main-side">
        <section className="card flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.description}>
                    <td>{l.description}</td>
                    <td className="num">{formatNumber(l.quantity)}</td>
                    <td className="num">{formatNaira(l.unitKobo)}</td>
                    <td className="num">{formatNaira(l.amountKobo)}</td>
                  </tr>
                ))}
                <tr><td colSpan={3} className="strong">Subtotal</td><td className="num">{formatNaira(inv.subtotalKobo)}</td></tr>
                <tr><td colSpan={3}>VAT</td><td className="num">{formatNaira(inv.vatKobo)}</td></tr>
                <tr><td colSpan={3} className="strong">Total</td><td className="num strong">{formatNaira(inv.totalKobo)}</td></tr>
                <tr><td colSpan={3}>Paid</td><td className="num">{formatNaira(inv.paidKobo)}</td></tr>
                <tr><td colSpan={3} className="strong">Still owed</td><td className="num strong">{formatNaira(owed)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>{inv.dueOn ? `Due ${shortDay(inv.dueOn)} ${inv.dueOn.slice(0, 4)}` : 'Not sent yet'}</span>
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          {inv.status === 'draft' && (
            <section className="card">
              <h2>Being prepared</h2>
              <span className="muted">Check the lines against the client’s usage, then send it. Payment will be due in 14 days.</span>
              {finance ? (
                <form action={sendInvoiceAction}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <input type="hidden" name="back" value={here} />
                  <button className="btn btn-primary" type="submit">Send invoice</button>
                </form>
              ) : (
                <span className="small muted">Only finance can send invoices.</span>
              )}
            </section>
          )}

          {owed > 0 && finance && (
            <section className="card">
              <h2>Record a payment</h2>
              <form action={recordPaymentAction} className="stack" style={{ gap: 10 }}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <input type="hidden" name="back" value={here} />
                <div className="field">
                  <label htmlFor="amount">Amount received (₦)</label>
                  <input id="amount" className="input" name="amount" inputMode="decimal" defaultValue={(owed / 100).toFixed(2)} required />
                </div>
                <div className="field">
                  <label htmlFor="paidOn">Date received</label>
                  <input id="paidOn" className="input" type="date" name="paidOn" defaultValue={today} max={today} required />
                </div>
                <div className="field">
                  <label htmlFor="reference">Bank transfer reference</label>
                  <input id="reference" className="input" name="reference" maxLength={80} required />
                </div>
                <button className="btn btn-primary" type="submit">Record payment</button>
              </form>
            </section>
          )}

          <section className="card">
            <h2>Payments</h2>
            {inv.payments.length === 0 && <span className="muted">None yet.</span>}
            {inv.payments.map((p, i) => (
              <div key={i} className="row-between">
                <span>{shortDay(p.paidOn)} · <span className="muted">{p.reference ?? '—'}</span></span>
                <b>{formatNaira(p.amountKobo)}</b>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Shell>
  );
}
