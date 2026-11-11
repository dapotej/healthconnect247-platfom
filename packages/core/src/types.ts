/**
 * Shared domain types. These mirror the enums in supabase/migrations.
 *
 * Money is always an integer number of kobo (₦1 = 100 kobo). Never use
 * floating-point naira amounts in calculations.
 */

export type Kobo = number;

export const CONSULTATION_TYPES = ['coordinator_resolved', 'gp', 'follow_up', 'therapy'] as const;
export type ConsultationType = (typeof CONSULTATION_TYPES)[number];

export const PRICING_MODELS = ['payg', 'flex', 'unlimited'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const CHANNELS = ['app_voice', 'app_video', 'toll_free', 'callback'] as const;
export type Channel = (typeof CHANNELS)[number];

export const LANGUAGES = ['english', 'yoruba', 'igbo', 'hausa', 'other'] as const;
export type CallLanguage = (typeof LANGUAGES)[number];

export const OUTCOMES = [
  'advice',
  'prescription',
  'lab_test',
  'referral',
  'session_held',
  'callback_booked',
  'other',
] as const;
export type ConsultationOutcome = (typeof OUTCOMES)[number];

/** How a priced consultation is paid for. */
export type BillingMethod =
  /** Deducted from the client's prepaid Flex credit. */
  | 'credit'
  /** Added to the client's monthly pay-as-you-go invoice. */
  | 'invoice'
  /** Covered by the Unlimited per-member fee; no extra charge. */
  | 'included';

export interface Contract {
  id: string;
  clientId: string;
  pricingModel: PricingModel;
  /** Inclusive, YYYY-MM-DD. */
  startsOn: string;
  /** Inclusive, YYYY-MM-DD. */
  endsOn: string;
  /** Pay-as-you-go monthly platform fee. */
  platformFeeKobo: Kobo;
  /** Unlimited: fee per active member per month. */
  pmpmKobo: Kobo;
  /** Unlimited: therapy add-on per member per month. null = therapy not covered. */
  therapyAddonPmpmKobo: Kobo | null;
  /** Pay-as-you-go and Flex: price per consultation type. */
  rates: Partial<Record<ConsultationType, Kobo>>;
  /** Flex: low-balance warning threshold. */
  lowBalanceThresholdKobo: Kobo;
  /** e.g. 0.075 for 7.5%. */
  vatRate: number;
}

export interface PricedConsultation {
  occurredAt: string;
  type: ConsultationType;
  chargeKobo: Kobo;
  billing: BillingMethod;
}
