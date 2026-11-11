import { formatNaira, type CallLanguage, type Channel, type ConsultationOutcome, type ConsultationType, type Kobo } from '@hc247/core';

export { formatNaira };

/** "₦4.28m", "₦30.4m", "₦280,000" */
export function compactNaira(amount: Kobo): string {
  const naira = amount / 100;
  const abs = Math.abs(naira);
  if (abs < 1_000_000) return formatNaira(amount);
  const millions = naira / 1_000_000;
  const digits = abs >= 10_000_000 ? 1 : 2;
  return `${naira < 0 ? '−' : ''}₦${Math.abs(millions).toFixed(digits).replace(/\.?0+$/, '')}m`;
}

const numberFormat = new Intl.NumberFormat('en-NG');
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** "1 day", "3 days" */
export function plural(n: number, word: string): string {
  return `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;
}

export function formatPct(part: number, whole: number): string {
  if (whole === 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

const lagosDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "10 Nov, 21:12" in Lagos time. */
export function formatLagosDateTime(iso: string): string {
  return lagosDateTime.format(new Date(iso)).replace(' at', ',');
}

export const TYPE_LABELS: Record<ConsultationType, string> = {
  gp: 'GP consultation',
  coordinator_resolved: 'Resolved by care coordinator',
  follow_up: 'Follow-up consultation',
  therapy: 'Therapy session',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  app_voice: 'App · voice',
  app_video: 'App · video',
  toll_free: 'Toll-free line',
  phone: 'Phone call',
  web: 'Web portal',
  callback: 'Callback',
};

export const LANGUAGE_LABELS: Record<CallLanguage, string> = {
  english: 'English',
  yoruba: 'Yorùbá',
  igbo: 'Igbo',
  hausa: 'Hausa',
  other: 'Other',
};

export const OUTCOME_LABELS: Record<ConsultationOutcome, string> = {
  advice: 'Advice given',
  prescription: 'Prescription',
  lab_test: 'Lab test ordered',
  referral: 'Referred to hospital',
  session_held: 'Session held',
  callback_booked: 'Callback booked',
  other: 'Other',
};

export const PRICING_LABELS = { payg: 'Pay-as-you-go', flex: 'Flex Credits', unlimited: 'Unlimited' } as const;
