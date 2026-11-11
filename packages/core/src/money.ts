import type { Kobo } from './types.js';

export function nairaToKobo(naira: number): Kobo {
  const kobo = Math.round(naira * 100);
  assertKobo(kobo);
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

const nairaFormat = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "₦4,278,000" — for display only. */
export function formatNaira(amount: Kobo): string {
  return nairaFormat.format(amount / 100);
}
