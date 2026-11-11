import type { ConsultationType, Contract, Kobo, PricedConsultation } from './types.js';
import { lagosDate } from './dates.js';
import { vatOn } from './money.js';

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitKobo: Kobo;
  amountKobo: Kobo;
  consultationType?: ConsultationType;
}

export interface InvoiceDraft {
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  subtotalKobo: Kobo;
  vatKobo: Kobo;
  totalKobo: Kobo;
}

export interface InvoiceInput {
  contract: Contract;
  /** Inclusive, YYYY-MM-DD (Lagos dates). */
  periodStart: string;
  periodEnd: string;
  /** Priced consultations; only those inside the period are billed. */
  consultations: PricedConsultation[];
  /** Unlimited: number of active members billed for the period. */
  activeMembers?: number;
}

const TYPE_LABELS: Record<ConsultationType, string> = {
  gp: 'GP consultations',
  coordinator_resolved: 'Calls resolved by a care coordinator',
  follow_up: 'Follow-up consultations',
  therapy: 'Therapy sessions',
};

const TYPE_ORDER: ConsultationType[] = ['gp', 'coordinator_resolved', 'follow_up', 'therapy'];

/**
 * Build a monthly invoice for a pay-as-you-go or Unlimited client.
 *
 * Flex clients are not invoiced for usage: consultations are deducted from
 * prepaid credit, and only top-ups are invoiced.
 */
export function buildInvoice(input: InvoiceInput): InvoiceDraft {
  const { contract, periodStart, periodEnd } = input;
  if (periodEnd < periodStart) throw new Error('Invoice period ends before it starts');
  const lines: InvoiceLine[] = [];

  if (contract.pricingModel === 'flex') {
    throw new Error('Flex Credits clients are billed through credit top-ups, not usage invoices');
  }

  if (contract.pricingModel === 'payg') {
    if (contract.platformFeeKobo > 0) {
      lines.push({
        description: 'Monthly platform fee',
        quantity: 1,
        unitKobo: contract.platformFeeKobo,
        amountKobo: contract.platformFeeKobo,
      });
    }
    const inPeriod = input.consultations.filter((c) => {
      const d = lagosDate(c.occurredAt);
      return c.billing === 'invoice' && d >= periodStart && d <= periodEnd;
    });
    for (const type of TYPE_ORDER) {
      const ofType = inPeriod.filter((c) => c.type === type);
      if (ofType.length === 0) continue;
      const unit = contract.rates[type];
      if (unit === undefined) throw new Error(`No rate for ${type} on contract ${contract.id}`);
      const amount = ofType.reduce((sum, c) => sum + c.chargeKobo, 0);
      lines.push({
        description: TYPE_LABELS[type],
        quantity: ofType.length,
        unitKobo: unit,
        amountKobo: amount,
        consultationType: type,
      });
    }
  }

  if (contract.pricingModel === 'unlimited') {
    const members = input.activeMembers;
    if (members === undefined || !Number.isInteger(members) || members < 0) {
      throw new Error('Unlimited invoices need the number of active members');
    }
    lines.push({
      description: 'Unlimited access, per member per month',
      quantity: members,
      unitKobo: contract.pmpmKobo,
      amountKobo: members * contract.pmpmKobo,
    });
    if (contract.therapyAddonPmpmKobo !== null) {
      lines.push({
        description: 'Therapy add-on, per member per month',
        quantity: members,
        unitKobo: contract.therapyAddonPmpmKobo,
        amountKobo: members * contract.therapyAddonPmpmKobo,
      });
    }
  }

  const subtotalKobo = lines.reduce((sum, l) => sum + l.amountKobo, 0);
  const vatKobo = vatOn(subtotalKobo, contract.vatRate);
  return { periodStart, periodEnd, lines, subtotalKobo, vatKobo, totalKobo: subtotalKobo + vatKobo };
}

/** Usage summary by consultation type, as shown on the client details screen. */
export function usageByType(
  consultations: PricedConsultation[],
): Array<{ type: ConsultationType; count: number; totalKobo: Kobo }> {
  return TYPE_ORDER.map((type) => {
    const ofType = consultations.filter((c) => c.type === type);
    return { type, count: ofType.length, totalKobo: ofType.reduce((s, c) => s + c.chargeKobo, 0) };
  }).filter((row) => row.count > 0);
}
