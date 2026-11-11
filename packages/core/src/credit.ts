import type { Kobo, PricedConsultation } from './types.js';
import { daysInclusive, lagosDate } from './dates.js';

export type LedgerKind = 'opening' | 'topup' | 'usage' | 'adjustment';

export interface LedgerEntry {
  occurredAt: string;
  kind: LedgerKind;
  /** Positive adds credit, negative uses it. Usage is always negative. */
  amountKobo: Kobo;
  reference?: string;
}

export function balance(entries: LedgerEntry[]): Kobo {
  return entries.reduce((sum, e) => sum + e.amountKobo, 0);
}

/**
 * Average credit used per day between two dates (inclusive, Lagos time).
 * Used to tell clients roughly how long their credit will last.
 */
export function averageDailyUsage(entries: LedgerEntry[], from: string, to: string): Kobo {
  const days = daysInclusive(from, to);
  if (days <= 0) return 0;
  const used = entries
    .filter((e) => e.kind === 'usage')
    .filter((e) => {
      const d = lagosDate(e.occurredAt);
      return d >= from && d <= to;
    })
    .reduce((sum, e) => sum - e.amountKobo, 0);
  return Math.round(used / days);
}

/** Whole days of credit left at the given daily rate, or null if there's no recent usage. */
export function daysOfCreditLeft(currentBalance: Kobo, dailyUsage: Kobo): number | null {
  if (dailyUsage <= 0) return null;
  return Math.max(0, Math.floor(currentBalance / dailyUsage));
}

export function isLowBalance(currentBalance: Kobo, threshold: Kobo): boolean {
  return currentBalance < threshold;
}

/**
 * One usage entry per Lagos calendar day for Flex consultations, as shown in
 * the client portal's credit history ("Usage · 143 consultations").
 */
export function dailyUsageEntries(
  consultations: PricedConsultation[],
): Array<LedgerEntry & { day: string; consultationCount: number }> {
  const byDay = new Map<string, { total: Kobo; count: number }>();
  for (const c of consultations) {
    if (c.billing !== 'credit') continue;
    const day = lagosDate(c.occurredAt);
    const agg = byDay.get(day) ?? { total: 0, count: 0 };
    agg.total += c.chargeKobo;
    agg.count += 1;
    byDay.set(day, agg);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { total, count }]) => ({
      day,
      occurredAt: `${day}T23:59:59+01:00`,
      kind: 'usage' as const,
      amountKobo: -total,
      consultationCount: count,
    }));
}
