import { describe, expect, it } from 'vitest';
import {
  NotCoveredError,
  balance,
  buildInvoice,
  contractOn,
  dailyUsageEntries,
  daysOfCreditLeft,
  averageDailyUsage,
  formatNaira,
  isLowBalance,
  priceConsultation,
  usageByType,
  type PricedConsultation,
  type ConsultationType,
} from '../src/index.js';
import { flexContract, paygContract, unlimitedContract } from './fixtures.js';

function priced(contract = flexContract, type: ConsultationType, occurredAt: string, n = 1): PricedConsultation[] {
  return Array.from({ length: n }, () => ({ occurredAt, type, ...priceConsultation(contract, type) }));
}

describe('priceConsultation', () => {
  it('charges Flex consultations to credit at the contract rate', () => {
    expect(priceConsultation(flexContract, 'gp')).toEqual({ chargeKobo: 380_000, billing: 'credit' });
  });

  it('adds pay-as-you-go consultations to the invoice', () => {
    expect(priceConsultation(paygContract, 'gp')).toEqual({ chargeKobo: 450_000, billing: 'invoice' });
  });

  it('includes Unlimited consultations at no extra charge', () => {
    expect(priceConsultation(unlimitedContract, 'gp')).toEqual({ chargeKobo: 0, billing: 'included' });
  });

  it('refuses therapy on Unlimited without the add-on', () => {
    expect(() => priceConsultation(unlimitedContract, 'therapy')).toThrow(NotCoveredError);
    const withAddon = { ...unlimitedContract, therapyAddonPmpmKobo: 12_000 };
    expect(priceConsultation(withAddon, 'therapy').billing).toBe('included');
  });

  it('refuses a service with no rate on the contract', () => {
    const noTherapy = { ...flexContract, rates: { gp: 380_000 } };
    expect(() => priceConsultation(noTherapy, 'therapy')).toThrow(/no rate/);
  });

  it('finds the contract in force using Lagos dates', () => {
    // 30 June 23:30 UTC is already 1 July in Lagos.
    expect(contractOn([flexContract], '2026-06-30T23:30:00Z')?.id).toBe('contract-hmo-a');
    expect(contractOn([flexContract], '2026-06-30T22:30:00Z')).toBeUndefined();
  });
});

describe('the [HMO A] figures in the mockups', () => {
  const day = '2026-11-05T10:00:00+01:00';
  const month = [
    ...priced(flexContract, 'gp', day, 980),
    ...priced(flexContract, 'coordinator_resolved', day, 360),
    ...priced(flexContract, 'follow_up', day, 60),
    ...priced(flexContract, 'therapy', day, 20),
  ];

  it('add up to ₦4,278,000 for 1,420 consultations', () => {
    const rows = usageByType(month);
    expect(rows.map((r) => r.count)).toEqual([980, 360, 60, 20]);
    const total = rows.reduce((s, r) => s + r.totalKobo, 0);
    expect(total).toBe(427_800_000);
    expect(formatNaira(total)).toBe('₦4,278,000');
  });

  it('leave ₦1.35m of credit after a ₦5m top-up and ₦628,000 carried over', () => {
    const ledger = [
      { occurredAt: '2026-11-01T00:00:00+01:00', kind: 'opening' as const, amountKobo: 62_800_000 },
      { occurredAt: '2026-11-01T09:00:00+01:00', kind: 'topup' as const, amountKobo: 500_000_000 },
      ...dailyUsageEntries(month),
    ];
    expect(balance(ledger)).toBe(135_000_000);
    expect(isLowBalance(135_000_000, flexContract.lowBalanceThresholdKobo)).toBe(false);
  });
});

describe('Flex credit', () => {
  it('groups usage into one entry per Lagos day', () => {
    const entries = dailyUsageEntries([
      ...priced(flexContract, 'gp', '2026-11-09T23:30:00Z', 2), // 10 Nov in Lagos
      ...priced(flexContract, 'gp', '2026-11-10T08:00:00+01:00', 1),
      ...priced(flexContract, 'gp', '2026-11-09T12:00:00+01:00', 1),
    ]);
    expect(entries.map((e) => [e.day, e.consultationCount, e.amountKobo])).toEqual([
      ['2026-11-09', 1, -380_000],
      ['2026-11-10', 3, -1_140_000],
    ]);
  });

  it('estimates days of credit left from recent usage', () => {
    const ledger = [
      { occurredAt: '2026-11-01T10:00:00+01:00', kind: 'usage' as const, amountKobo: -40_000_000 },
      { occurredAt: '2026-11-02T10:00:00+01:00', kind: 'usage' as const, amountKobo: -46_000_000 },
    ];
    const daily = averageDailyUsage(ledger, '2026-11-01', '2026-11-02');
    expect(daily).toBe(43_000_000);
    expect(daysOfCreditLeft(135_000_000, daily)).toBe(3);
    expect(daysOfCreditLeft(135_000_000, 0)).toBeNull();
  });
});

describe('buildInvoice', () => {
  it('bills pay-as-you-go: platform fee plus usage by type, plus VAT', () => {
    const nov = '2026-11-03T14:00:00+01:00';
    const consultations = [
      ...priced(paygContract, 'gp', nov, 10),
      ...priced(paygContract, 'coordinator_resolved', nov, 4),
      ...priced(paygContract, 'gp', '2026-10-31T23:59:00+01:00', 1), // previous month
    ];
    const inv = buildInvoice({ contract: paygContract, periodStart: '2026-11-01', periodEnd: '2026-11-30', consultations });
    expect(inv.lines.map((l) => [l.description, l.quantity, l.amountKobo])).toEqual([
      ['Monthly platform fee', 1, 25_000_000],
      ['GP consultations', 10, 4_500_000],
      ['Calls resolved by a care coordinator', 4, 320_000],
    ]);
    expect(inv.subtotalKobo).toBe(29_820_000);
    expect(inv.vatKobo).toBe(2_236_500);
    expect(inv.totalKobo).toBe(32_056_500);
  });

  it('bills Unlimited per active member: 52,000 × ₦350 = ₦18.2m', () => {
    const inv = buildInvoice({
      contract: unlimitedContract,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      consultations: [],
      activeMembers: 52_000,
    });
    expect(inv.subtotalKobo).toBe(1_820_000_000);
    expect(formatNaira(inv.subtotalKobo)).toBe('₦18,200,000');
  });

  it('does not invoice Flex usage', () => {
    expect(() =>
      buildInvoice({ contract: flexContract, periodStart: '2026-11-01', periodEnd: '2026-11-30', consultations: [] }),
    ).toThrow(/top-ups/);
  });
});
