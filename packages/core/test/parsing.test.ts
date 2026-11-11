import { describe, expect, it } from 'vitest';
import {
  MissingColumnsError,
  lagosDate,
  maskPhone,
  matchMember,
  normalizeNigerianPhone,
  parseConsultationExport,
  parseDate,
  parseLagosDateTime,
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

  const result = parseConsultationExport(csv);

  it('maps types, channels, languages and outcomes', () => {
    expect(result.consultations.map((c) => [c.externalRef, c.type, c.channel, c.language, c.outcome])).toEqual([
      ['C-1001', 'gp', 'app_voice', 'english', 'prescription'],
      ['C-1002', 'coordinator_resolved', 'toll_free', 'hausa', 'advice'],
      ['C-1003', 'therapy', 'app_video', 'yoruba', 'session_held'],
    ]);
    expect(result.consultations[0]).toMatchObject({
      occurredAt: '2026-11-10T21:12:00+01:00',
      phoneE164: '+2348034567812',
      icd10Code: 'I10',
    });
  });

  it('reports rows it cannot import', () => {
    expect(result.errors).toEqual([
      { row: 5, name: 'C-1004', problem: 'Consultation type not recognised (Lab results); Diagnosis code not valid (E119)' },
      { row: 6, name: 'C-1001', problem: 'Reference also used on row 2' },
    ]);
  });

  it('matches members by ID, then by a unique phone number', () => {
    const index = {
      byExternalId: new Map([['HC-100001', 'm1'], ['HC-100004', 'm4']]),
      byPhone: new Map([['+2348161112240', ['m7']], ['+2348034567812', ['m1', 'm2']]]),
    };
    const [gp, coord, therapy] = result.consultations;
    expect(matchMember(gp!, index)).toEqual({ memberId: 'm1' });
    expect(matchMember(coord!, index)).toEqual({ memberId: 'm4' });
    expect(matchMember(therapy!, index)).toEqual({ memberId: 'm7' });
    expect(matchMember({ ...gp!, memberExternalId: null }, index)).toEqual({
      problem: 'Phone number matches more than one member; member ID needed',
    });
  });
});
