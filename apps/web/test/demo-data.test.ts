import { balance } from '@hc247/core';
import { describe, expect, it } from 'vitest';
import { consultationsCsv } from '@/lib/consultations';
import { demoDataSource as data } from '@/lib/data/demo';

describe('demo data matches the mockups for [HMO A]', () => {
  it('has 1,420 consultations costing ₦4,278,000 on 1–10 November', async () => {
    const rows = await data.clientConsultations('hmo-a', '2026-11-01', '2026-11-10');
    expect(rows).toHaveLength(1_420);
    expect(rows.reduce((s, c) => s + c.chargeKobo, 0)).toBe(427_800_000);
  });

  it('leaves ₦1,350,000 of credit', async () => {
    expect(balance(await data.creditLedger('hmo-a'))).toBe(135_000_000);
  });

  it('has 14,800 active and 120 suspended members', async () => {
    expect(await data.memberCounts('hmo-a')).toMatchObject({ active: 14_800, suspended: 120 });
  });
});

describe('privacy rules in the demo data source', () => {
  it('never gives an HMO therapy diagnoses', async () => {
    const rows = await data.clientConsultations('hmo-a', '2026-10-01', '2026-11-10');
    const therapy = rows.filter((c) => c.type === 'therapy');
    expect(therapy.length).toBeGreaterThan(0);
    expect(therapy.every((c) => c.diagnosisCode === null && c.diagnosisLabel === null)).toBe(true);
    expect(rows.some((c) => c.type === 'gp' && c.diagnosisCode)).toBe(true);
  });

  it('only returns the requested client’s consultations', async () => {
    const rows = await data.clientConsultations('hmo-b', '2026-11-01', '2026-11-10');
    expect(rows.every((c) => c.externalMemberId.startsWith('HB-'))).toBe(true);
  });

  it('gives staff billing rows without diagnoses or clinician details', async () => {
    const [row] = await data.billingConsultations('2026-11-10', '2026-11-10');
    expect(row).toBeDefined();
    expect(Object.keys(row!)).not.toEqual(expect.arrayContaining(['diagnosisCode']));
    expect('diagnosisLabel' in row! || 'clinicianName' in row!).toBe(false);
  });
});

describe('claims CSV export', () => {
  it('leaves therapy diagnoses blank and escapes risky cells', async () => {
    const rows = (await data.clientConsultations('hmo-a', '2026-11-01', '2026-11-10')).slice(0, 50);
    const therapy = (await data.clientConsultations('hmo-a', '2026-11-01', '2026-11-10')).find((c) => c.type === 'therapy')!;
    const csv = consultationsCsv([...rows, therapy, { ...therapy, id: 'x', externalRef: 'X-1', memberName: '=HYPERLINK("http://evil")' }]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('ICD-11 code');
    expect(lines).toHaveLength(53);
    const therapyLine = lines[51]!;
    expect(therapyLine).toContain('Therapy session');
    expect(therapyLine).not.toMatch(/F41|F32|Z63|Anxiety|Depression/);
    expect(lines[52]).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});
