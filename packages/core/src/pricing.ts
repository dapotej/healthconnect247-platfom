import type { BillingMethod, ConsultationType, Contract, Kobo } from './types.js';
import { lagosDate } from './dates.js';

export class NotCoveredError extends Error {
  constructor(
    public readonly consultationType: ConsultationType,
    public readonly contractId: string,
    reason: string,
  ) {
    super(`${consultationType} is not covered by contract ${contractId}: ${reason}`);
    this.name = 'NotCoveredError';
  }
}

export interface Price {
  chargeKobo: Kobo;
  billing: BillingMethod;
}

/**
 * Price one consultation under a client's contract.
 *
 * - Pay-as-you-go: the contract rate, added to the monthly invoice.
 * - Flex Credits: the contract rate, deducted from prepaid credit.
 * - Unlimited: included in the per-member fee. Therapy is only included
 *   when the contract has the therapy add-on.
 */
export function priceConsultation(contract: Contract, type: ConsultationType): Price {
  switch (contract.pricingModel) {
    case 'unlimited': {
      if (type === 'therapy' && contract.therapyAddonPmpmKobo === null) {
        throw new NotCoveredError(type, contract.id, 'the contract has no therapy add-on');
      }
      return { chargeKobo: 0, billing: 'included' };
    }
    case 'payg':
    case 'flex': {
      const rate = contract.rates[type];
      if (rate === undefined) {
        throw new NotCoveredError(type, contract.id, 'the contract has no rate for this service');
      }
      return { chargeKobo: rate, billing: contract.pricingModel === 'flex' ? 'credit' : 'invoice' };
    }
  }
}

/** Whether a consultation at this time falls inside the contract dates (Lagos time). */
export function isWithinContract(contract: Contract, occurredAt: string): boolean {
  const day = lagosDate(occurredAt);
  return day >= contract.startsOn && day <= contract.endsOn;
}

/** The contract in force on a given date, if any. Contracts for one client must not overlap. */
export function contractOn(contracts: Contract[], occurredAt: string): Contract | undefined {
  return contracts.find((c) => isWithinContract(c, occurredAt));
}
