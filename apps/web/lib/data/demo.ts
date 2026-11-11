/**
 * Demo data source: realistic, generated data for local development and
 * sales demos. Deterministic (seeded), so the figures are the same on every
 * run, and [HMO A]'s November usage matches the mockups exactly.
 *
 * Holds everything in memory. Member uploads change the data until the
 * server restarts.
 */
import {
  dailyUsageEntries,
  lagosDate,
  priceConsultation,
  buildInvoice,
  type CallLanguage,
  type Channel,
  type ConsultationOutcome,
  type ConsultationType,
  type Contract,
  type NormalizedMember,
  type PricedConsultation,
  type RowError,
} from '@hc247/core';
import type {
  BillingConsultation,
  Client,
  ClientConsultation,
  ConsultationImportRecord,
  DataSource,
  Invoice,
  LedgerRow,
  Member,
  MemberCounts,
  MemberFilter,
  MemberImportSummary,
  StaffMember,
} from './types';
import { DataRuleError } from './types';

// ── Seeded randomness ────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
function weighted<T>(rng: Rng, options: ReadonlyArray<readonly [T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, w] of options) {
    r -= w;
    if (r <= 0) return value;
  }
  return options[options.length - 1]![0];
}
function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

// ── Reference lists ──────────────────────────────────────────────────────
const FIRST_NAMES = [
  'Bisi', 'Tunde', 'Folake', 'Kemi', 'Segun', 'Funmi', 'Yemi', 'Bola', 'Dayo', 'Tola',
  'Emeka', 'Chioma', 'Ngozi', 'Ifeanyi', 'Amaka', 'Obinna', 'Chidi', 'Adaeze', 'Uche', 'Nkechi',
  'Halima', 'Sadiq', 'Aisha', 'Musa', 'Ibrahim', 'Zainab', 'Usman', 'Hauwa', 'Abubakar', 'Fatima',
  'Grace', 'Daniel', 'Peter', 'Esther', 'Samuel', 'Blessing', 'Joseph', 'Mary', 'David', 'Ruth',
];
const LAST_NAMES = [
  'Adebayo', 'Bakare', 'Ojo', 'Lawal', 'Ogunleye', 'Adeyemi', 'Balogun', 'Okafor', 'Eze', 'Obi',
  'Nwosu', 'Okeke', 'Uche', 'Nwankwo', 'Kalu', 'Musa', 'Bello', 'Ibrahim', 'Sani', 'Garba',
  'Abubakar', 'Yusuf', 'Okon', 'Akpan', 'Etim', 'Ade', 'Afolabi', 'Olawale', 'Chukwu', 'Danjuma',
];
const MOBILE_PREFIXES = ['803', '806', '805', '807', '813', '816', '703', '706', '708', '802', '808', '812', '901', '902', '905', '909'];
const CLINICIANS = [
  { name: 'Dr F. Adeyemi', licence: 'MDCN/[number]' },
  { name: 'Dr K. Bello', licence: 'MDCN/[number]' },
  { name: 'Dr I. Nwankwo', licence: 'MDCN/[number]' },
  { name: 'Dr U. Garba', licence: 'MDCN/[number]' },
  { name: 'Dr A. Okafor', licence: 'MDCN/[number]' },
  { name: 'Dr T. Afolabi', licence: 'MDCN/[number]' },
];
const COORDINATORS = ['C. Nwosu', 'I. Sule', 'B. Ogunleye', 'Z. Abubakar'];
const THERAPISTS = ['A. Kalu', 'M. Danjuma'];
// ICD-11, as the EMR records them, weighted roughly like a real week of GP calls.
const DIAGNOSES: ReadonlyArray<readonly [readonly [string, string], number]> = [
  [['1F40', 'Malaria due to Plasmodium falciparum'], 31],
  [['1F4Z', 'Malaria, unspecified'], 24],
  [['CA0Z', 'Upper respiratory tract disorders, unspecified'], 13],
  [['CA07.0', 'Acute upper respiratory infection, site unspecified'], 12],
  [['MD12', 'Cough'], 6],
  [['EA60.Z', 'Fungal infection of the skin, unspecified'], 4],
  [['BA00', 'Essential hypertension'], 4],
  [['FA01.Z', 'Osteoarthritis of knee, unspecified'], 3],
  [['DA61', 'Peptic ulcer, site unspecified'], 3],
  [['9A60', 'Conjunctivitis'], 3],
  [['GC08', 'Urinary tract infection, site not specified'], 2],
  [['1A40', 'Gastroenteritis or colitis without specification of infectious agent'], 3],
  [['MD92', 'Dyspepsia'], 2],
] as const;
const THERAPY_DIAGNOSES = [
  ['6B00', 'Generalised anxiety disorder'],
  ['6A70', 'Single episode depressive disorder'],
  ['6B43', 'Adjustment disorder'],
] as const;

// ── Clients and contracts ────────────────────────────────────────────────
interface ClientSpec {
  client: Client;
  prefix: string;
  active: number;
  suspended: number;
  appShare: number;
  contract: Contract;
  /** Consultations on 1–10 November (the mockups' "this month"). */
  novCount: number;
}

const FLEX_RATES = { coordinator_resolved: 70_000, gp: 380_000, follow_up: 170_000, therapy: 1_000_000 };
const PAYG_RATES = { coordinator_resolved: 80_000, gp: 450_000, follow_up: 200_000, therapy: 1_200_000 };

function contract(partial: Partial<Contract> & Pick<Contract, 'id' | 'clientId' | 'pricingModel' | 'startsOn' | 'endsOn'>): Contract {
  return {
    platformFeeKobo: 0,
    pmpmKobo: 0,
    therapyAddonPmpmKobo: null,
    rates: {},
    lowBalanceThresholdKobo: 50_000_000,
    vatRate: 0.075,
    ...partial,
  };
}

const SPECS: ClientSpec[] = [
  {
    client: { id: 'lagos-state', name: 'Lagos State Government', type: 'government', isPilot: false, emrNames: ['LASHMA'] },
    prefix: 'LS', active: 52_000, suspended: 0, appShare: 0.31, novCount: 3_210,
    contract: contract({ id: 'c-lagos', clientId: 'lagos-state', pricingModel: 'unlimited', startsOn: '2026-01-01', endsOn: '2026-12-31', pmpmKobo: 35_000 }),
  },
  {
    client: { id: 'hmo-a', name: '[HMO A]', type: 'hmo', isPilot: false, emrNames: ['HMO A'] },
    prefix: 'HA', active: 14_800, suspended: 120, appShare: 6_210 / 14_800, novCount: 1_420,
    contract: contract({ id: 'c-hmo-a', clientId: 'hmo-a', pricingModel: 'flex', startsOn: '2026-07-01', endsOn: '2027-06-30', rates: FLEX_RATES }),
  },
  {
    client: { id: 'hmo-b', name: '[HMO B]', type: 'hmo', isPilot: false, emrNames: ['HMO B'] },
    prefix: 'HB', active: 9_600, suspended: 45, appShare: 0.38, novCount: 980,
    contract: contract({ id: 'c-hmo-b', clientId: 'hmo-b', pricingModel: 'payg', startsOn: '2026-04-01', endsOn: '2027-03-31', platformFeeKobo: 25_000_000, rates: PAYG_RATES }),
  },
  {
    client: { id: 'hmo-c', name: '[HMO C]', type: 'hmo', isPilot: false, emrNames: ['HMO C'] },
    prefix: 'HC', active: 5_350, suspended: 12, appShare: 0.35, novCount: 512,
    contract: contract({ id: 'c-hmo-c', clientId: 'hmo-c', pricingModel: 'flex', startsOn: '2026-10-01', endsOn: '2027-09-30', rates: FLEX_RATES }),
  },
  {
    client: { id: 'hmo-d', name: '[HMO D]', type: 'hmo', isPilot: true, emrNames: ['HMO D'] },
    prefix: 'HD', active: 2_500, suspended: 0, appShare: 0.4, novCount: 290,
    contract: contract({ id: 'c-hmo-d', clientId: 'hmo-d', pricingModel: 'payg', startsOn: '2026-10-01', endsOn: '2027-01-31', platformFeeKobo: 25_000_000, rates: PAYG_RATES }),
  },
];

/** [HMO A]'s consultations per day on 1–10 November, from the mockups. */
const HMO_A_NOV_DAILY = [131, 138, 149, 135, 142, 158, 151, 133, 140, 143];
/** [HMO A]'s November mix by type, from the mockups: 1,420 consultations, ₦4,278,000. */
const HMO_A_NOV_TYPES: Array<[ConsultationType, number]> = [['gp', 980], ['coordinator_resolved', 360], ['follow_up', 60], ['therapy', 20]];

interface StoredConsultation extends ClientConsultation {
  clientId: string;
}

interface DemoStore {
  members: Member[];
  membersByClient: Map<string, Member[]>;
  consultations: StoredConsultation[];
  ledgers: Map<string, LedgerRow[]>;
  invoices: Invoice[];
  imports: Map<string, MemberImportSummary>;
  staff: StaffMember[];
  consultationImports: ConsultationImportRecord[];
  patientCodes: Map<string, string>;
}

function randomTime(rng: Rng, day: string): string {
  // Busier in the evening, as call centres usually are.
  const hour = weighted(rng, [[7, 2], [9, 4], [11, 4], [13, 4], [15, 4], [17, 5], [19, 7], [21, 6], [23, 2], [1, 1]] as const);
  const h = Math.min(23, hour + Math.floor(rng() * 2));
  const m = Math.floor(rng() * 60);
  return `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
}

function dayList(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

function build(): DemoStore {
  const rng = mulberry32(247);
  const members: Member[] = [];
  const membersByClient = new Map<string, Member[]>();

  for (const spec of SPECS) {
    const list: Member[] = [];
    const total = spec.active + spec.suspended;
    for (let i = 0; i < total; i++) {
      const fullName = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      const m: Member = {
        id: `${spec.client.id}-m${i}`,
        clientId: spec.client.id,
        externalMemberId: `${spec.prefix}-${100_001 + i}`,
        fullName,
        dateOfBirth: `${1950 + Math.floor(rng() * 58)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
        phoneE164: `+234${pick(rng, MOBILE_PREFIXES)}${String(Math.floor(rng() * 10_000_000)).padStart(7, '0')}`,
        planCode: spec.client.type === 'government' ? 'State scheme' : rng() < 0.75 ? 'GP + therapy' : 'GP only',
        status: i < spec.active ? 'active' : 'suspended',
        usesApp: i < Math.round(spec.active * spec.appShare),
      };
      list.push(m);
      members.push(m);
    }
    // Shuffle so app users aren't all at the top of the list.
    membersByClient.set(spec.client.id, shuffle(rng, list));
  }

  const consultations: StoredConsultation[] = [];
  let ref = 50_000;

  const makeConsultation = (spec: ClientSpec, type: ConsultationType, day: string, activeMembers: Member[]): StoredConsultation => {
    const member = pick(rng, activeMembers);
    const priced = priceConsultation(spec.contract, type);
    const channel: Channel = weighted(rng, [['phone', 64], ['app_video', 28], ['app_voice', 8]] as const);
    const language: CallLanguage = weighted(rng, [['english', 61], ['yoruba', 18], ['hausa', 12], ['igbo', 9]] as const);
    let clinician: { name: string; licence: string | null } = pick(rng, CLINICIANS);
    let dx: readonly [string, string] | null = weighted(rng, DIAGNOSES);
    let outcome: ConsultationOutcome;
    if (type === 'coordinator_resolved') {
      clinician = { name: pick(rng, COORDINATORS), licence: null };
      dx = null;
      outcome = weighted(rng, [['advice', 85], ['callback_booked', 15]] as const);
    } else if (type === 'therapy') {
      clinician = { name: pick(rng, THERAPISTS), licence: '[licence]' };
      dx = pick(rng, THERAPY_DIAGNOSES);
      outcome = 'session_held';
    } else {
      outcome = weighted(rng, [['prescription', 62], ['advice', 24], ['lab_test', 8], ['referral', 6]] as const);
    }
    return {
      id: `cons-${ref}`,
      externalRef: `C-${ref++}`,
      clientId: spec.client.id,
      occurredAt: randomTime(rng, day),
      type,
      channel,
      language,
      memberId: member.id,
      externalMemberId: member.externalMemberId,
      memberName: member.fullName,
      clinicianName: clinician.name,
      clinicianLicence: clinician.licence,
      diagnosisCode: dx?.[0] ?? null,
      diagnosisLabel: dx?.[1] ?? null,
      outcome,
      chargeKobo: priced.chargeKobo,
      billing: priced.billing,
    };
  };

  const randomType = (spec: ClientSpec): ConsultationType => {
    const t = weighted(rng, [['gp', 69], ['coordinator_resolved', 25], ['follow_up', 4], ['therapy', 2]] as const);
    // Unlimited without the therapy add-on doesn't cover therapy.
    return t === 'therapy' && spec.contract.pricingModel === 'unlimited' && spec.contract.therapyAddonPmpmKobo === null ? 'gp' : t;
  };

  for (const spec of SPECS) {
    const active = membersByClient.get(spec.client.id)!.filter((m) => m.status === 'active');
    const novDays = dayList('2026-11-01', '2026-11-10');

    if (spec.client.id === 'hmo-a') {
      const types = shuffle(rng, HMO_A_NOV_TYPES.flatMap(([t, n]) => Array<ConsultationType>(n).fill(t)));
      let i = 0;
      novDays.forEach((day, d) => {
        for (let k = 0; k < HMO_A_NOV_DAILY[d]!; k++) consultations.push(makeConsultation(spec, types[i++]!, day, active));
      });
    } else {
      for (let k = 0; k < spec.novCount; k++) consultations.push(makeConsultation(spec, randomType(spec), pick(rng, novDays), active));
    }

    // October history, for "last month" and comparisons.
    const octStart = spec.contract.startsOn > '2026-10-01' ? spec.contract.startsOn : '2026-10-01';
    const octDays = dayList(octStart, '2026-10-31');
    const octCount = Math.round((spec.novCount / 10) * octDays.length * (0.88 + rng() * 0.1));
    for (let k = 0; k < octCount; k++) consultations.push(makeConsultation(spec, randomType(spec), pick(rng, octDays), active));
  }
  consultations.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  // ── Flex credit ledgers ──
  const ledgers = new Map<string, LedgerRow[]>();
  const novPriced = (clientId: string): PricedConsultation[] =>
    consultations.filter((c) => c.clientId === clientId && c.occurredAt >= '2026-11-01');
  const usageRows = (clientId: string): LedgerRow[] =>
    dailyUsageEntries(novPriced(clientId)).map((e) => ({
      occurredAt: e.occurredAt,
      kind: 'usage',
      amountKobo: e.amountKobo,
      consultationCount: e.consultationCount,
    }));

  ledgers.set('hmo-a', [
    { occurredAt: '2026-11-01T00:00:00+01:00', kind: 'opening', amountKobo: 62_800_000, note: 'Carried over from October' },
    { occurredAt: '2026-11-01T09:00:00+01:00', kind: 'topup', amountKobo: 500_000_000, reference: 'TOP-0033', note: 'Top-up received' },
    ...usageRows('hmo-a'),
  ]);
  const hmoCUsage = novPriced('hmo-c').reduce((s, c) => s + c.chargeKobo, 0);
  const hmoCTopup = 150_000_000;
  ledgers.set('hmo-c', [
    { occurredAt: '2026-11-01T00:00:00+01:00', kind: 'opening', amountKobo: Math.max(0, 28_000_000 + hmoCUsage - hmoCTopup), note: 'Carried over from October' },
    { occurredAt: '2026-11-03T11:00:00+01:00', kind: 'topup', amountKobo: hmoCTopup, reference: 'TOP-0031', note: 'Top-up received' },
    ...usageRows('hmo-c'),
  ]);

  // ── Invoices (pay-as-you-go and Unlimited) ──
  const pricedIn = (clientId: string, from: string, to: string) =>
    consultations.filter((c) => c.clientId === clientId && lagosDate(c.occurredAt) >= from && lagosDate(c.occurredAt) <= to);
  const invoice = (
    spec: ClientSpec,
    number: string,
    from: string,
    to: string,
    status: Invoice['status'],
    extra: Partial<Invoice> = {},
  ): Invoice => {
    const draft = buildInvoice({
      contract: spec.contract,
      periodStart: from,
      periodEnd: to,
      consultations: pricedIn(spec.client.id, from, to),
      activeMembers: spec.active,
    });
    return {
      id: number,
      clientId: spec.client.id,
      number,
      periodStart: from,
      periodEnd: to,
      status,
      lines: draft.lines,
      subtotalKobo: draft.subtotalKobo,
      vatKobo: draft.vatKobo,
      totalKobo: draft.totalKobo,
      paidKobo: 0,
      dueOn: null,
      paidOn: null,
      payments: [],
      ...extra,
    };
  };
  const spec = (id: string) => SPECS.find((s) => s.client.id === id)!;
  const pay = (inv: Invoice, amountKobo: number, paidOn: string, reference: string) => {
    inv.payments.push({ amountKobo, paidOn, reference });
    inv.paidKobo += amountKobo;
    if (inv.paidKobo === inv.totalKobo) inv.paidOn = paidOn;
    return inv;
  };
  const lagosOct = invoice(spec('lagos-state'), 'INV-0140', '2026-10-01', '2026-10-31', 'part_paid', { dueOn: '2026-10-15' });
  pay(lagosOct, lagosOct.totalKobo - 480_000_000, '2026-10-24', 'LASG-TRF-0912');
  const lagosNov = invoice(spec('lagos-state'), 'INV-0151', '2026-11-01', '2026-11-30', 'paid', { dueOn: '2026-11-15' });
  pay(lagosNov, lagosNov.totalKobo, '2026-11-03', 'LASG-TRF-0988');
  // INV-0156 is [HMO B]'s November invoice, still being prepared.
  const invoices: Invoice[] = [
    invoice(spec('hmo-b'), 'INV-0156', '2026-11-01', '2026-11-30', 'draft'),
    lagosNov,
    invoice(spec('hmo-d'), 'INV-0149', '2026-10-01', '2026-10-31', 'sent', { dueOn: '2026-11-15' }),
    invoice(spec('hmo-b'), 'INV-0142', '2026-10-01', '2026-10-31', 'sent', { dueOn: '2026-10-20' }),
    lagosOct,
  ];

  const staff: StaffMember[] = [
    { id: 'st-1', fullName: 'Tola Bankole', email: 'tola.bankole@[company-domain]', role: 'ops_admin', languages: ['english', 'yoruba'], licenceNumber: null, licenceExpiresOn: null, status: 'active' },
    { id: 'st-2', fullName: '[Finance officer]', email: 'finance@[company-domain]', role: 'finance', languages: ['english'], licenceNumber: null, licenceExpiresOn: null, status: 'active' },
    { id: 'st-3', fullName: 'Dr Kunle Bello', email: 'k.bello@[company-domain]', role: 'clinical_lead', languages: ['english', 'yoruba'], licenceNumber: 'MDCN/[number]', licenceExpiresOn: '2026-11-28', status: 'active' },
    { id: 'st-4', fullName: 'Dr Funmilayo Adeyemi', email: 'f.adeyemi@[company-domain]', role: 'gp', languages: ['english', 'yoruba'], licenceNumber: 'MDCN/[number]', licenceExpiresOn: '2027-03-31', status: 'active' },
    { id: 'st-5', fullName: 'Dr Ifeoma Nwankwo', email: 'i.nwankwo@[company-domain]', role: 'gp', languages: ['english', 'igbo'], licenceNumber: 'MDCN/[number]', licenceExpiresOn: '2027-01-31', status: 'active' },
    { id: 'st-6', fullName: 'Dr Usman Garba', email: 'u.garba@[company-domain]', role: 'gp', languages: ['english', 'hausa'], licenceNumber: 'MDCN/[number]', licenceExpiresOn: '2026-12-02', status: 'active' },
    { id: 'st-7', fullName: 'Dr Adaobi Okafor', email: 'a.okafor@[company-domain]', role: 'gp', languages: ['english', 'igbo'], licenceNumber: 'MDCN/[number]', licenceExpiresOn: '2026-10-31', status: 'active' },
    { id: 'st-8', fullName: 'Adaeze Kalu', email: 'a.kalu@[company-domain]', role: 'therapist', languages: ['english', 'igbo'], licenceNumber: '[licence]', licenceExpiresOn: '2027-08-31', status: 'active' },
    { id: 'st-9', fullName: 'Chioma Nwosu', email: 'c.nwosu@[company-domain]', role: 'coordinator', languages: ['english', 'igbo'], licenceNumber: null, licenceExpiresOn: null, status: 'active' },
    { id: 'st-10', fullName: 'Ibrahim Sule', email: 'i.sule@[company-domain]', role: 'coordinator', languages: ['english', 'hausa'], licenceNumber: null, licenceExpiresOn: null, status: 'invited' },
  ];

  const imports = new Map<string, MemberImportSummary>([
    ['hmo-a', {
      filename: 'members_november.csv',
      uploadedAt: '2026-11-02T10:14:00+01:00',
      rowsTotal: 2_400,
      added: 2_356,
      updated: 31,
      errors: [
        { row: 118, name: 'Chukwudi Eze', problem: 'Phone number missing' },
        { row: 402, name: 'Aisha Lawal', problem: 'Date of birth not valid (31/02/1989)' },
        { row: 1_377, name: 'Peter Okon', problem: 'Member ID also used on row 96' },
      ],
    }],
  ]);

  return { members, membersByClient, consultations, ledgers, invoices, imports, staff, consultationImports: [], patientCodes: new Map() };
}

// Keep one store across hot reloads in development.
const globalForDemo = globalThis as unknown as { hc247DemoStore?: DemoStore };
function store(): DemoStore {
  globalForDemo.hc247DemoStore ??= build();
  return globalForDemo.hc247DemoStore;
}

const inRange = (iso: string, from: string, to: string) => {
  const d = lagosDate(iso);
  return d >= from && d <= to;
};

export const demoDataSource: DataSource = {
  async listClients() {
    return SPECS.map((s) => s.client);
  },
  async getClient(id) {
    return SPECS.find((s) => s.client.id === id)?.client ?? null;
  },
  async contractsFor(clientId) {
    return SPECS.filter((s) => s.client.id === clientId).map((s) => s.contract);
  },

  async memberCounts(clientId): Promise<MemberCounts> {
    const list = store().membersByClient.get(clientId) ?? [];
    let active = 0;
    let suspended = 0;
    let notOnApp = 0;
    for (const m of list) {
      if (m.status === 'active') {
        active++;
        if (!m.usesApp) notOnApp++;
      } else suspended++;
    }
    return { active, suspended, notOnApp };
  },
  async searchMembers(clientId, { filter, query, offset, limit }) {
    const q = query?.trim().toLowerCase().replace(/\s+/g, ' ');
    // Phone digits as people type them: 0803… or 234803… both match +234803…
    const digits = q?.replace(/\D/g, '').replace(/^(234|0)/, '');
    const rows = (store().membersByClient.get(clientId) ?? []).filter((m) => {
      if (filter === 'active' && m.status !== 'active') return false;
      if (filter === 'suspended' && m.status !== 'suspended') return false;
      if (filter === 'not_on_app' && (m.status !== 'active' || m.usesApp)) return false;
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.externalMemberId.toLowerCase().includes(q) ||
        (digits !== undefined && digits.length >= 4 && m.phoneE164.includes(digits))
      );
    });
    return { rows: rows.slice(offset, offset + limit), total: rows.length };
  },
  async memberIdsFor(clientId) {
    return new Set((store().membersByClient.get(clientId) ?? []).map((m) => m.externalMemberId));
  },
  async saveMemberImport(clientId, normalized: NormalizedMember[], meta: { filename: string; rowsTotal: number; errors: RowError[] }) {
    const s = store();
    const list = s.membersByClient.get(clientId) ?? [];
    const byId = new Map(list.map((m) => [m.externalMemberId, m]));
    let added = 0;
    let updated = 0;
    for (const n of normalized) {
      const existing = byId.get(n.externalMemberId);
      if (existing) {
        Object.assign(existing, { fullName: n.fullName, phoneE164: n.phoneE164, dateOfBirth: n.dateOfBirth, planCode: n.planCode });
        updated++;
      } else {
        const m: Member = {
          id: `${clientId}-u${list.length}`,
          clientId,
          externalMemberId: n.externalMemberId,
          fullName: n.fullName,
          dateOfBirth: n.dateOfBirth,
          phoneE164: n.phoneE164,
          planCode: n.planCode,
          status: 'active',
          usesApp: false,
        };
        list.unshift(m);
        s.members.push(m);
        byId.set(m.externalMemberId, m);
        added++;
      }
    }
    s.membersByClient.set(clientId, list);
    const summary: MemberImportSummary = {
      filename: meta.filename,
      uploadedAt: new Date().toISOString(),
      rowsTotal: meta.rowsTotal,
      added,
      updated,
      errors: meta.errors,
    };
    s.imports.set(clientId, summary);
    return summary;
  },
  async lastMemberImport(clientId) {
    return store().imports.get(clientId) ?? null;
  },

  async clientConsultations(clientId, from, to) {
    // Same rule as the public.client_consultations view: no therapy diagnoses.
    return store()
      .consultations.filter((c) => c.clientId === clientId && inRange(c.occurredAt, from, to))
      .map(({ clientId: _omit, ...c }) =>
        c.type === 'therapy' ? { ...c, diagnosisCode: null, diagnosisLabel: null } : c,
      );
  },
  async billingConsultations(from, to, clientId) {
    // Same rule as public.billing_consultations: no diagnoses or clinician details.
    return store()
      .consultations.filter((c) => (!clientId || c.clientId === clientId) && inRange(c.occurredAt, from, to))
      .map(
        (c): BillingConsultation => ({
          id: c.id,
          clientId: c.clientId,
          occurredAt: c.occurredAt,
          type: c.type,
          channel: c.channel,
          language: c.language,
          outcome: c.outcome,
          chargeKobo: c.chargeKobo,
          billing: c.billing,
        }),
      );
  },

  async setMemberStatus(clientId, memberId, status) {
    const member = store().membersByClient.get(clientId)?.find((m) => m.id === memberId);
    if (!member) throw new DataRuleError('member_not_found', 'Member not found for this client');
    member.status = status;
  },

  async creditLedger(clientId) {
    return store().ledgers.get(clientId) ?? [];
  },
  async recordTopUp(clientId, top) {
    const spec = SPECS.find((s) => s.client.id === clientId);
    if (spec?.contract.pricingModel !== 'flex') throw new DataRuleError('not_flex', 'Only Flex Credits clients have credit to top up');
    const ledger = store().ledgers.get(clientId) ?? [];
    ledger.push({ occurredAt: `${top.receivedOn}T12:00:00+01:00`, kind: 'topup', amountKobo: top.amountKobo, reference: top.reference, note: 'Top-up received' });
    store().ledgers.set(clientId, ledger);
  },

  async invoices(clientId) {
    return store()
      .invoices.filter((i) => !clientId || i.clientId === clientId)
      .sort((a, b) => b.number.localeCompare(a.number));
  },
  async getInvoice(id) {
    return store().invoices.find((i) => i.id === id) ?? null;
  },
  async createInvoiceDraft(clientId, draft) {
    const s = store();
    if (s.invoices.some((i) => i.clientId === clientId && i.periodStart === draft.periodStart && i.status !== 'void')) {
      throw new DataRuleError('invoice_exists', 'This client already has an invoice for that period');
    }
    const next = Math.max(0, ...s.invoices.map((i) => Number(i.number.replace(/\D/g, '')))) + 1;
    const number = `INV-${String(next).padStart(4, '0')}`;
    const inv: Invoice = {
      id: number,
      clientId,
      number,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      status: 'draft',
      lines: draft.lines,
      subtotalKobo: draft.subtotalKobo,
      vatKobo: draft.vatKobo,
      totalKobo: draft.totalKobo,
      paidKobo: 0,
      dueOn: null,
      paidOn: null,
      payments: [],
    };
    s.invoices.push(inv);
    return inv;
  },
  async sendInvoice(id, dueOn) {
    const inv = store().invoices.find((i) => i.id === id);
    if (!inv) throw new DataRuleError('invoice_not_found', 'Invoice not found');
    if (inv.status !== 'draft') throw new DataRuleError('not_draft', 'Only invoices being prepared can be sent');
    inv.status = 'sent';
    inv.dueOn = dueOn;
    return inv;
  },
  async recordPayment(id, payment) {
    // Same rules as the apply_invoice_payment trigger in the database.
    const inv = store().invoices.find((i) => i.id === id);
    if (!inv) throw new DataRuleError('invoice_not_found', 'Invoice not found');
    if (inv.status === 'draft' || inv.status === 'void') throw new DataRuleError('not_sent', 'This invoice has not been sent, so it cannot be paid');
    if (inv.paidKobo + payment.amountKobo > inv.totalKobo) throw new DataRuleError('overpayment', 'That is more than the amount still owed');
    inv.payments.push(payment);
    inv.paidKobo += payment.amountKobo;
    inv.status = inv.paidKobo === inv.totalKobo ? 'paid' : 'part_paid';
    if (inv.status === 'paid') inv.paidOn = payment.paidOn;
    return inv;
  },

  async setClientEmrNames(clientId, names) {
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const taken = SPECS.some((s) => s.client.id !== clientId && s.client.emrNames.some((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase())));
    if (taken) throw new DataRuleError('emr_name_taken', 'That EMR name belongs to another client');
    const spec = SPECS.find((s) => s.client.id === clientId);
    if (!spec) throw new DataRuleError('not_allowed', 'Client not found');
    spec.client.emrNames = wanted;
  },
  async memberIndex(clientId) {
    const codes = store().patientCodes;
    return (store().membersByClient.get(clientId) ?? []).map((m) => ({
      id: m.id,
      externalMemberId: m.externalMemberId,
      phoneE164: m.phoneE164,
      patientCode: codes.get(m.id) ?? null,
    }));
  },
  async existingConsultationRefs(refs) {
    const all = new Set(store().consultations.map((c) => c.externalRef));
    return new Set(refs.filter((r) => all.has(r)));
  },
  async recordConsultationImport(input) {
    const s = store();
    const known = new Set(s.consultations.map((c) => c.externalRef));
    let imported = 0;
    let skippedDuplicates = input.alreadyImported;
    for (const c of input.consultations) {
      if (known.has(c.externalRef)) {
        skippedDuplicates++;
        continue;
      }
      const member = s.members.find((m) => m.id === c.memberId);
      if (!member) continue;
      s.consultations.push({
        id: `imp-${c.externalRef}`,
        externalRef: c.externalRef,
        clientId: c.clientId,
        occurredAt: c.occurredAt,
        type: c.type,
        channel: c.channel,
        language: c.language,
        memberId: member.id,
        externalMemberId: member.externalMemberId,
        memberName: member.fullName,
        clinicianName: c.clinicianName,
        clinicianLicence: c.clinicianLicence,
        diagnosisCode: c.diagnosisCode,
        diagnosisLabel: c.diagnosisLabel,
        outcome: c.outcome,
        chargeKobo: c.chargeKobo,
        billing: c.billing,
      });
      if (c.billing === 'credit' && c.chargeKobo > 0) {
        const ledger = s.ledgers.get(c.clientId) ?? [];
        ledger.push({ occurredAt: c.occurredAt, kind: 'usage', amountKobo: -c.chargeKobo, consultationCount: 1 });
        s.ledgers.set(c.clientId, ledger);
      }
      known.add(c.externalRef);
      imported++;
    }
    for (const { memberId, patientCode } of input.memberCodes) {
      if (!s.patientCodes.has(memberId)) s.patientCodes.set(memberId, patientCode);
    }
    const id = `imp-${s.consultationImports.length + 1}`;
    s.consultationImports.unshift({
      id,
      filename: input.filename,
      importedAt: new Date().toISOString(),
      rowsTotal: input.rowsTotal,
      imported,
      skippedDuplicates,
      problems: input.problems,
    });
    return { id, imported, skippedDuplicates };
  },
  async consultationImports(limit) {
    return store().consultationImports.slice(0, limit);
  },

  async listStaff() {
    return store().staff;
  },
  async inviteStaff(input) {
    const s = store();
    if (s.staff.some((m) => m.email.toLowerCase() === input.email.toLowerCase())) {
      throw new DataRuleError('staff_exists', 'Someone with this email is already on the team');
    }
    const member: StaffMember = { ...input, id: `st-${s.staff.length + 1}`, status: 'invited' };
    s.staff.push(member);
    return member;
  },
};
