import { lagosDate } from '@hc247/core';

export type PeriodKey = 'today' | '7d' | 'this_month' | 'last_month' | 'custom';

export interface Period {
  key: PeriodKey;
  /** Inclusive Lagos dates, YYYY-MM-DD. */
  from: string;
  to: string;
  /** "1–10 Nov 2026" */
  label: string;
  days: number;
}

export const PERIOD_OPTIONS: Array<{ key: Exclude<PeriodKey, 'custom'>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidDate(s: string | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "10 Nov 2026", "1–10 Nov 2026", "28 Oct – 3 Nov 2026", "28 Dec 2025 – 3 Jan 2026" */
export function formatRange(from: string, to: string): string {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  const mon = (m: number) => MONTHS[m - 1];
  if (from === to) return `${d1} ${mon(m1)} ${y1}`;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${mon(m1)} ${y1}`;
  if (y1 === y2) return `${d1} ${mon(m1)} – ${d2} ${mon(m2)} ${y1}`;
  return `${d1} ${mon(m1)} ${y1} – ${d2} ${mon(m2)} ${y2}`;
}

function make(key: PeriodKey, from: string, to: string): Period {
  return { key, from, to, label: formatRange(from, to), days: daysBetween(from, to) };
}

/**
 * Resolve the period selector from URL parameters (?period=7d, or
 * ?period=custom&from=…&to=…). Unknown or invalid values fall back to this month.
 */
export function resolvePeriod(
  params: { period?: string | string[]; from?: string | string[]; to?: string | string[] },
  nowIso: string,
): Period {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const key = one(params.period);
  const today = lagosDate(nowIso);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const monthStart = `${today.slice(0, 7)}-01`;

  switch (key) {
    case 'today':
      return make('today', today, today);
    case '7d':
      return make('7d', addDays(today, -6), today);
    case 'last_month': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const prefix = `${py}-${String(pm).padStart(2, '0')}`;
      return make('last_month', `${prefix}-01`, `${prefix}-${String(lastDayOfMonth(py, pm)).padStart(2, '0')}`);
    }
    case 'custom': {
      const from = one(params.from);
      const to = one(params.to);
      if (isValidDate(from) && isValidDate(to) && from <= to && to <= today) return make('custom', from, to);
      break;
    }
  }
  return make('this_month', monthStart, today);
}

/** The period to compare against: the same days of the previous month for "this month", otherwise the preceding run of days. */
export function previousPeriod(p: Period): Period {
  if (p.key === 'this_month' || p.key === 'last_month') {
    const [y, m] = p.from.split('-').map(Number) as [number, number];
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const prefix = `${py}-${String(pm).padStart(2, '0')}`;
    const lastDay = lastDayOfMonth(py, pm);
    const toDay = Math.min(Number(p.to.slice(8, 10)), lastDay);
    const endDay = p.key === 'last_month' ? lastDay : toDay;
    return make('custom', `${prefix}-01`, `${prefix}-${String(endDay).padStart(2, '0')}`);
  }
  return make('custom', addDays(p.from, -p.days), addDays(p.from, -1));
}

/** Query string for a period, to keep it when linking between pages. */
export function periodQuery(p: Period): string {
  if (p.key === 'custom') return `period=custom&from=${p.from}&to=${p.to}`;
  return `period=${p.key}`;
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function shortDay(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}
