import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConsultationTable } from '@hc247/core';
import { describe, expect, it } from 'vitest';
import { demoDataSource } from '@/lib/data/demo';
import { runEmrImport } from '@/lib/emr-import';
import { readTable } from '@/lib/spreadsheet';

describe('reading the EMR spreadsheet', () => {
  it('reads cells as text: dates as typed, phone numbers, blanks and empty rows', async () => {
    const bytes = readFileSync(join(__dirname, 'fixtures', 'emr-export-sample.xlsx'));
    const table = await readTable(new File([bytes], 'export.xlsx'));
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      Encounter_EncounterId: '9001',
      Encounter_EncounterDate: '2026-11-03 10:54:00',
      Encounter_ContactNumber: '8030000001',
      Encounter_PrescriptionSent: 'FALSE',
      Patient_PatientCode: '2611000001',
    });
    expect(table.rows[1]).toMatchObject({ Encounter_EncounterDate: '2026-11-03 23:30:15', Encounter_ContactNumber: '' });
    const parsed = parseConsultationTable(table);
    expect(parsed.consultations[0]).toMatchObject({ occurredAt: '2026-11-03T10:54:00+01:00', phoneE164: '+2348030000001', diagnosisCode: 'BA00' });
    expect(parsed.pending).toHaveLength(1);
  });
});

describe('importing an EMR export (demo data)', () => {
  it('matches clients and members, prices, remembers patient codes and skips repeats', async () => {
    const [member] = (await demoDataSource.searchMembers('hmo-a', { filter: 'active', offset: 0, limit: 1 })).rows;
    const local = member!.phoneE164.replace('+234', '0');
    const headers = ['Encounter_EncounterId', 'Encounter_EncounterDate', 'Encounter_ServiceName', 'Encounter_EncounterSubType',
      'Encounter_CommunicationMethod', 'Encounter_ContactNumber', 'Encounter_Status', 'DoctorNote_ICD10Code', 'Patient_PatientCode'];
    const row = (cells: string[]) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    const table = {
      headers,
      rows: [
        row(['T-1', '2026-11-09 10:00:00', 'hmo a', 'Medical Consultation', 'Phone', local, 'Closed', '1F40', 'P-1']),
        row(['T-2', '2026-11-09 11:00:00', 'SELF PAID', 'Medical Consultation', 'Phone', local, 'Closed', '', 'P-2']),
        row(['T-3', '2026-11-09 12:00:00', 'HMO A', 'Medical Consultation', 'Video', '08000000000', 'Closed', '', 'P-3']),
        row(['T-4', '2026-11-09 13:00:00', 'HMO A', 'Medical Consultation', 'Video', '', 'Open', '', 'P-1']),
      ],
    };
    const first = await runEmrImport(demoDataSource, 'export.xlsx', parseConsultationTable(table));
    expect(first).toMatchObject({ imported: 1, skippedDuplicates: 0 });
    expect(first.pending.map((p) => p.name)).toEqual(['T-4']);
    expect(first.problems.map((p) => [p.name, p.problem.split(' (')[0]!.split('.')[0]])).toEqual([
      ['T-2', 'Client "SELF PAID" isn\'t set up'],
      ['T-3', 'No member found with this patient code, member ID or phone number'],
    ]);

    const saved = (await demoDataSource.clientConsultations('hmo-a', '2026-11-09', '2026-11-09')).find((c) => c.externalRef === 'T-1');
    expect(saved).toMatchObject({ memberId: member!.id, diagnosisCode: '1F40', chargeKobo: 380_000, billing: 'credit', channel: 'phone' });
    expect((await demoDataSource.memberIndex('hmo-a')).find((m) => m.id === member!.id)?.patientCode).toBe('P-1');

    const again = await runEmrImport(demoDataSource, 'export.xlsx', parseConsultationTable(table));
    expect(again).toMatchObject({ imported: 0, skippedDuplicates: 1 });
    expect((await demoDataSource.consultationImports(5))[0]).toMatchObject({ filename: 'export.xlsx', rowsTotal: 4, imported: 0, skippedDuplicates: 1 });
  });
});
