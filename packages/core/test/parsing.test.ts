import { describe, expect, it } from 'vitest';
import {
  MissingColumnsError,
  lagosDate,
  maskPhone,
  matchMember,
  normalizeNigerianPhone,
  parseConsultationExport,
  parseConsultationTable,
  matchClient,
  parseDate,
  parseLagosDateTime,
  parseNairaInput,
  formatNaira,
  validateMemberList,
} from '../src/index.js';

describe('phone numbers', () => {
  it.each([
    ['0803 456 7812', '+2348034567812'],
    ['+234 803 456 7812', '+2348034567812'],
    ['2348034567812', '+2348034567812'],
    ['803-456-7812', '+2348034567812'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each(['', '12345', '08034567812345', '+44 20 7946 0958'])('rejects %s', (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });

  it('masks for display', () => {
    expect(maskPhone('+2348034567812')).toBe('+234 803 *** **12');
  });
});

describe('naira amounts typed into forms', () => {
  it.each([
    ['5,000,000', 500_000_000],
    ['₦4,278,000.50', 427_800_050],
    ['NGN 700', 70_000],
    ['0.5', 50],
  ])('reads %s', (input, kobo) => {
    expect(parseNairaInput(input)).toBe(kobo);
  });

  it.each(['', '0', '-500', '5.123', 'abc', '1e6', '20,000,000,000'])('refuses %s', (input) => {
    expect(parseNairaInput(input)).toBeNull();
  });

  it('displays kobo with two digits, and whole naira without', () => {
    expect(formatNaira(427_800_000)).toBe('₦4,278,000');
    expect(formatNaira(9_413_250)).toBe('₦94,132.50');
    expect(formatNaira(5)).toBe('₦0.05');
  });
});

describe('dates', () => {
  it('reads day-first dates and rejects impossible ones', () => {
    expect(parseDate('04/09/1972')).toBe('1972-09-04');
    expect(parseDate('1972-09-04')).toBe('1972-09-04');
    expect(parseDate('31/02/1989')).toBeNull();
    expect(parseDate('29/02/2024')).toBe('2024-02-29');
  });

  it('treats export times without an offset as Lagos time', () => {
    expect(parseLagosDateTime('10/11/2026 21:12')).toBe('2026-11-10T21:12:00+01:00');
    expect(parseLagosDateTime('2026-11-10T20:12:00Z')).toBe('2026-11-10T21:12:00+01:00');
    expect(parseLagosDateTime('10/11/2026 25:00')).toBeNull();
  });

  it('gives the Lagos calendar date', () => {
    expect(lagosDate('2026-11-09T23:30:00Z')).toBe('2026-11-10');
  });
});

describe('validateMemberList', () => {
  const csv = [
    'Enrollee Name,Enrollee ID,GSM Number,DOB,Plan',
    'Bisi Adebayo,hc-100001,0803 456 7812,04/09/1972,GP + therapy',
    'Chukwudi Eze,HC-100002,,12/01/1990,GP only',
    'Aisha Lawal,HC-100003,0806 111 2233,31/02/1989,GP only',
    'Peter Okon,HC-100001,0809 222 3344,,GP only',
    'Halima Musa,HC-100004,+234 806 000 0055,,',
  ].join('\n');

  it('accepts good rows, reports bad ones with spreadsheet row numbers', () => {
    const result = validateMemberList(csv, new Set(['HC-100004']));
    expect(result.rowsTotal).toBe(5);
    expect(result.members.map((m) => m.externalMemberId)).toEqual(['HC-100001', 'HC-100004']);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toEqual([
      { row: 3, name: 'Chukwudi Eze', problem: 'Phone number missing' },
      { row: 4, name: 'Aisha Lawal', problem: 'Date of birth not valid (31/02/1989)' },
      { row: 5, name: 'Peter Okon', problem: 'Member ID also used on row 2' },
    ]);
    expect(result.members[0]).toMatchObject({ phoneE164: '+2348034567812', dateOfBirth: '1972-09-04' });
  });

  it('refuses a file without the required columns', () => {
    expect(() => validateMemberList('Name,Phone\nA,0803 456 7812', new Set())).toThrow(MissingColumnsError);
  });
});

describe('parseConsultationExport', () => {
  const csv = [
    'Call ID,Date,Time,Enrollee ID,Caller Number,Call Type,Channel,Language,Doctor,ICD10,Diagnosis,Disposition',
    'C-1001,10/11/2026,21:12,HC-100001,08034567812,GP Consultation,Mobile app,English,Dr F. Adeyemi,I10,Hypertension,Prescription issued',
    'C-1002,10/11/2026,20:40,HC-100004,,Enquiry - resolved by agent,0800 line,Hausa,C. Nwosu,,,Advised',
    'C-1003,10/11/2026,19:48,,08161112240,Counselling session,Video,Yorùbá,A. Kalu,F41.1,Anxiety,Session completed',
    'C-1004,10/11/2026,19:30,HC-100009,,Lab results,App,English,Dr K. Bello,E119,,Lab ordered',
    'C-1001,10/11/2026,18:00,HC-100001,,GP Consultation,App,English,Dr I. Nwankwo,B54,Malaria,Prescription',
  ].join('\n');

  const result = parseConsultationExport(csv, { codeSystem: 'icd10' });

  it('maps types, channels, languages and outcomes', () => {
    expect(result.consultations.map((c) => [c.externalRef, c.type, c.channel, c.language, c.outcome])).toEqual([
      ['C-1001', 'gp', 'app_voice', 'english', 'prescription'],
      ['C-1002', 'coordinator_resolved', 'toll_free', 'hausa', 'advice'],
      ['C-1003', 'therapy', 'app_video', 'yoruba', 'session_held'],
    ]);
    expect(result.consultations[0]).toMatchObject({
      occurredAt: '2026-11-10T21:12:00+01:00',
      phoneE164: '+2348034567812',
      diagnosisCode: 'I10',
      diagnosisCodeSystem: 'icd10',
    });
  });

  it('reports rows it cannot import', () => {
    expect(result.errors).toEqual([
      { row: 5, name: 'C-1004', problem: 'Consultation type not recognised (Lab results); Diagnosis code not valid ICD-10 (E119)' },
      { row: 6, name: 'C-1001', problem: 'Reference also used on row 2' },
    ]);
  });

  it('matches members by ID, then by a unique phone number', () => {
    const index = {
      byExternalId: new Map([['HC-100001', 'm1'], ['HC-100004', 'm4']]),
      byPhone: new Map([['+2348161112240', ['m7']], ['+2348034567812', ['m1', 'm2']]]),
    };
    const [gp, coord, therapy] = result.consultations;
    expect(matchMember(gp!, index)).toEqual({ memberId: 'm1', via: 'member_id' });
    expect(matchMember(coord!, index)).toEqual({ memberId: 'm4', via: 'member_id' });
    expect(matchMember(therapy!, index)).toEqual({ memberId: 'm7', via: 'phone' });
    expect(matchMember({ ...gp!, memberExternalId: null }, index)).toEqual({
      problem: 'Phone number matches more than one member; member ID needed',
    });
  });
});

describe('HealthConnect EMR export', () => {
  // The EMR's column layout with made-up rows. Clinical-note columns are
  // included to prove they're ignored.
  const headers = [
    'AssignedDoctorName', 'DocumentingDoctorName', 'Encounter_EncounterId', 'Encounter_PatientId',
    'Encounter_EncounterDate', 'Encounter_ServiceName', 'Encounter_EncounterType', 'Encounter_EncounterSubType',
    'Encounter_ReasonForEncounter', 'Encounter_CommunicationMethod', 'Encounter_ContactNumber', 'Encounter_Status',
    'Encounter_ClinicalOutcome', 'DoctorNote_ChiefComplaint', 'DoctorNote_PlanNotes', 'DoctorNote_NoteStatus',
    'DoctorNote_ICD10Code', 'DoctorNote_ICD10Description', 'Patient_PatientCode', 'Patient_Gender',
  ];
  const row = (cells: string[]) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  const table = {
    headers,
    rows: [
      row(['Dr. Ada Obi', 'Dr. Ada Obi', '5001', '9001', '2026-11-03 10:54:00', 'HMO One', 'Clinical Encounter', 'Medical Consultation',
        'Headache', 'Video', '8030000001', 'Closed', 'medications', 'Headache x 2/7', 'Tabs pcm 1g tds x 3/7', 'Finalized',
        'ba00', 'Essential hypertension', '2611000001', 'Female']),
      row(['Dr. Ada Obi', 'Dr. Ada Obi', '5002', '9002', '2026-11-03 11:10:00', 'HMO Two', 'Clinical Encounter', 'Medical Consultation',
        'Fever', 'Phone', '8030000002', 'Closed', '1. Tabs ACT 80/480 bd x 3/7', 'Fever', 'ACT', 'Finalized',
        'FA01.Z', 'Osteoarthritis of knee, unspecified', '2611000002', 'Male']),
      row(['Dr. Ada Obi', '', '5003', '9003', '2026-11-04 09:00:00', 'HMO One', 'Clinical Encounter', 'Medical Inquiry',
        '', 'Phone', '', 'Closed', 'Responded to inquiry', '', '', 'Finalized', '', '', '2611000003', 'Male']),
      row(['Dr. Ada Obi', '', '5004', '9004', '2026-11-04 09:30:00', 'Student Health Consultation', 'Consultation', '',
        '', 'Portal', '803000000', 'Closed', 'referral', '', '', 'Finalized', '1F40&XN69B', 'Malaria', '2611000004', 'Female']),
      row(['Dr. Ada Obi', '', '5005', '9005', '2026-11-04 10:00:00', 'HMO One', 'Clinical Encounter', 'Medical Consultation',
        '', 'Video', '8030000005', 'Open', '', '', '', 'Draft', '', '', '2611000005', 'Female']),
      row(['Dr. Ada Obi', 'Dr. Ada Obi', '5006', '9006', '2026-11-04 10:30:00', 'HMO One', 'Clinical Encounter', 'Medical Consultation',
        '', 'Video', '8030000006', 'Closed', 'treatment', '', '', 'Finalized', 'I10', 'Hypertension', '2611000006', 'Male']),
    ],
  };
  const result = parseConsultationTable(table);

  it('reads the EMR columns and maps ICD-11 diagnoses, channels and outcomes', () => {
    expect(result.consultations.map((c) => [c.externalRef, c.clientName, c.type, c.channel, c.diagnosisCode, c.outcome])).toEqual([
      ['5001', 'HMO One', 'gp', 'app_video', 'BA00', 'prescription'],
      ['5002', 'HMO Two', 'gp', 'phone', 'FA01.Z', 'prescription'],
      ['5003', 'HMO One', 'coordinator_resolved', 'phone', null, 'advice'],
      ['5004', 'Student Health Consultation', 'gp', 'web', '1F40&XN69B', 'referral'],
    ]);
    expect(result.consultations[0]).toMatchObject({
      occurredAt: '2026-11-03T10:54:00+01:00',
      phoneE164: '+2348030000001',
      patientCode: '2611000001',
      clinicianName: 'Dr. Ada Obi',
      diagnosisCodeSystem: 'icd11',
      diagnosisLabel: 'Essential hypertension',
    });
    expect(result.consultations[3]!.phoneE164).toBeNull();
  });

  it('never carries clinical notes or free-text outcomes', () => {
    const text = JSON.stringify(result.consultations);
    for (const note of ['Headache', 'Tabs pcm', 'ACT 80/480', 'Fever', 'Female']) expect(text).not.toContain(note);
  });

  it('holds back unfinished encounters and reports bad rows', () => {
    expect(result.pending).toEqual([{ row: 6, name: '5005', problem: "Not finished yet (Open). Import it again once it's closed." }]);
    expect(result.errors).toEqual([{ row: 7, name: '5006', problem: 'Diagnosis code not valid ICD-11 (I10)' }]);
  });

  it('matches clients by any of their export names', () => {
    const clients = [{ id: 'c1', names: ['HMO One', 'HMO-ONE Ltd'] }, { id: 'c2', names: ['HMO Two'] }];
    expect(matchClient('hmo one', clients)).toEqual({ clientId: 'c1' });
    expect(matchClient('HMO-ONE LTD', clients)).toEqual({ clientId: 'c1' });
    expect(matchClient('Test Hmo', clients)).toMatchObject({ problem: expect.stringContaining("isn't set up") });
  });

  it('matches members by a remembered patient code before the phone number', () => {
    const [first] = result.consultations;
    const index = {
      byPatientCode: new Map([['2611000001', 'm9']]),
      byExternalId: new Map<string, string>(),
      byPhone: new Map([['+2348030000001', ['m1']]]),
    };
    expect(matchMember(first!, index)).toEqual({ memberId: 'm9', via: 'patient_code' });
    expect(matchMember(first!, { ...index, byPatientCode: new Map() })).toEqual({ memberId: 'm1', via: 'phone' });
  });
});
