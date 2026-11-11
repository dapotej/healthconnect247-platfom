import type { Invoice } from './data/types';
import { compactNaira } from './format';
import { shortDay } from './period';

export function owedKobo(inv: Invoice): number {
  return inv.status === 'sent' || inv.status === 'part_paid' ? inv.totalKobo - inv.paidKobo : 0;
}

export function isOverdue(inv: Invoice, today: string): boolean {
  return owedKobo(inv) > 0 && inv.dueOn !== null && inv.dueOn < today;
}

/** Status label for an invoice as of a Lagos date. */
export function invoiceBadge(inv: Invoice, today: string): { tone: 'ok' | 'warn' | 'info' | 'off'; text: string } {
  if (inv.status === 'paid') return { tone: 'ok', text: inv.paidOn ? `Paid ${shortDay(inv.paidOn)}` : 'Paid' };
  if (inv.status === 'void') return { tone: 'off', text: 'Cancelled' };
  if (inv.status === 'draft') return { tone: 'off', text: 'Being prepared' };
  if (isOverdue(inv, today)) {
    const days = Math.round((Date.parse(today) - Date.parse(inv.dueOn!)) / 86_400_000);
    return { tone: 'warn', text: `Overdue ${days} days · ${compactNaira(owedKobo(inv))}` };
  }
  if (inv.status === 'part_paid') return { tone: 'warn', text: `${compactNaira(owedKobo(inv))} unpaid` };
  return { tone: 'info', text: inv.dueOn ? `Due ${shortDay(inv.dueOn)}` : 'Sent' };
}
