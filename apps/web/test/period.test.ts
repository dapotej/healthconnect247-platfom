import { describe, expect, it } from 'vitest';
import { formatRange, previousPeriod, resolvePeriod } from '@/lib/period';

const NOW = '2026-11-10T22:00:00+01:00';

describe('resolvePeriod', () => {
  it('defaults to this month so far', () => {
    expect(resolvePeriod({}, NOW)).toMatchObject({ key: 'this_month', from: '2026-11-01', to: '2026-11-10', label: '1–10 Nov 2026', days: 10 });
  });

  it('handles the quick options', () => {
    expect(resolvePeriod({ period: 'today' }, NOW)).toMatchObject({ from: '2026-11-10', to: '2026-11-10', label: '10 Nov 2026' });
    expect(resolvePeriod({ period: '7d' }, NOW)).toMatchObject({ from: '2026-11-04', to: '2026-11-10' });
    expect(resolvePeriod({ period: 'last_month' }, NOW)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: '1–31 Oct 2026' });
    expect(resolvePeriod({ period: 'last_month' }, '2026-01-15T10:00:00+01:00')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('uses the Lagos date, not UTC', () => {
    // 23:30 UTC on 30 Nov is already 1 Dec in Lagos.
    expect(resolvePeriod({}, '2026-11-30T23:30:00Z')).toMatchObject({ from: '2026-12-01', to: '2026-12-01' });
  });

  it('accepts valid custom ranges and rejects bad ones', () => {
    expect(resolvePeriod({ period: 'custom', from: '2026-10-28', to: '2026-11-03' }, NOW)).toMatchObject({
      key: 'custom',
      label: '28 Oct – 3 Nov 2026',
      days: 7,
    });
    for (const bad of [
      { from: '2026-11-05', to: '2026-11-01' }, // backwards
      { from: '2026-02-30', to: '2026-03-01' }, // not a date
      { from: '2026-11-01', to: '2026-12-31' }, // in the future
      { from: "2026-11-01' or 1=1", to: '2026-11-02' },
    ]) {
      expect(resolvePeriod({ period: 'custom', ...bad }, NOW).key).toBe('this_month');
    }
  });

  it('compares with the same days of the previous month', () => {
    expect(previousPeriod(resolvePeriod({}, NOW))).toMatchObject({ from: '2026-10-01', to: '2026-10-10' });
    expect(previousPeriod(resolvePeriod({ period: '7d' }, NOW))).toMatchObject({ from: '2026-10-28', to: '2026-11-03' });
  });

  it('formats ranges across years', () => {
    expect(formatRange('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 – 3 Jan 2026');
  });
});
