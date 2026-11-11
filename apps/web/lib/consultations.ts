import { CONSULTATION_TYPES, OUTCOMES, type ConsultationOutcome, type ConsultationType } from '@hc247/core';
import type { ClientConsultation } from './data/types';
import { CHANNEL_LABELS, LANGUAGE_LABELS, OUTCOME_LABELS, TYPE_LABELS } from './format';

type Params = Record<string, string | string[] | undefined>;

export interface ConsultationFilters {
  type: ConsultationType | null;
  outcome: ConsultationOutcome | null;
  q: string;
}

export function readFilters(params: Params): ConsultationFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return {
    type: CONSULTATION_TYPES.find((t) => t === one(params.type)) ?? null,
    outcome: OUTCOMES.find((o) => o === one(params.outcome)) ?? null,
    q: (one(params.q) ?? '').trim().slice(0, 80),
  };
}

export function applyFilters(rows: ClientConsultation[], f: ConsultationFilters): ClientConsultation[] {
  const q = f.q.toLowerCase();
  return rows
    .filter((c) => (!f.type || c.type === f.type) && (!f.outcome || c.outcome === f.outcome))
    .filter((c) => !q || c.memberName.toLowerCase().includes(q) || c.externalMemberId.toLowerCase().includes(q))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  // Stop spreadsheet apps treating text as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const lagosParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Claims export. Therapy rows carry no diagnosis (the data source already
 * removes it); clinical notes are never included.
 */
export function consultationsCsv(rows: ClientConsultation[]): string {
  const header = [
    'Visit ID', 'Date', 'Time (Lagos)', 'Member ID', 'Member name', 'Type', 'Channel', 'Language',
    'Clinician', 'Clinician licence', 'ICD-11 code', 'Diagnosis', 'Outcome', 'Charge (NGN)',
  ];
  const lines = rows.map((c) => {
    const parts = Object.fromEntries(lagosParts.formatToParts(new Date(c.occurredAt)).map((p) => [p.type, p.value]));
    return [
      c.externalRef ?? c.id,
      `${parts.year}-${parts.month}-${parts.day}`,
      `${parts.hour}:${parts.minute}`,
      c.externalMemberId,
      c.memberName,
      TYPE_LABELS[c.type],
      c.channel ? CHANNEL_LABELS[c.channel] : null,
      c.language ? LANGUAGE_LABELS[c.language] : null,
      c.clinicianName,
      c.clinicianLicence,
      c.diagnosisCode,
      c.diagnosisLabel,
      c.outcome ? OUTCOME_LABELS[c.outcome] : null,
      (c.chargeKobo / 100).toFixed(2),
    ]
      .map(csvCell)
      .join(',');
  });
  // BOM so Excel opens the naira sign and accented names correctly.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
