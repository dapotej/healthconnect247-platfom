import type { Kobo } from './types.js';

export function nairaToKobo(naira: number): Kobo {
  const kobo = Math.round(naira * 100);
  assertKobo(kobo);
  return kobo;
}

/**
 * Read a naira amount as typed into a form: "5,000,000", "₦4,278,000.50",
 * "5000000". Returns kobo, or null if it isn't a positive amount with at
 * most two decimal places. Amounts above ₦10bn are refused as likely typos.
 */
export function parseNairaInput(input: string): Kobo | null {
  const s = input.trim().replace(/^₦|^NGN\s*/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.') as [string, string?];
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(kobo) || kobo <= 0 || kobo > 1_000_000_000_000) return null;
  return kobo;
}

export function assertKobo(value: number): asserts value is Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money must be a whole number of kobo, got ${value}`);
  }
}

/** VAT on an amount, rounded to the nearest kobo (half up). */
export function vatOn(amount: Kobo, rate: number): Kobo {
  if (rate < 0 || rate > 1) throw new Error(`VAT rate must be between 0 and 1, got ${rate}`);
  return Math.round(amount * rate);
}

const wholeNaira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});
const nairaWithKobo = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₦4,278,000", or "₦94,132.50" when there are kobo — for display only. */
export function formatNaira(amount: Kobo): string {
  return (amount % 100 === 0 ? wholeNaira : nairaWithKobo).format(amount / 100);
}
