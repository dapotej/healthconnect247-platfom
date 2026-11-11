import type { Contract } from '../src/types.js';

/** Rate card from the sales deck. */
export const flexContract: Contract = {
  id: 'contract-hmo-a',
  clientId: 'hmo-a',
  pricingModel: 'flex',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  platformFeeKobo: 0,
  pmpmKobo: 0,
  therapyAddonPmpmKobo: null,
  rates: { coordinator_resolved: 70_000, gp: 380_000, follow_up: 170_000, therapy: 1_000_000 },
  lowBalanceThresholdKobo: 50_000_000,
  vatRate: 0.075,
};

export const paygContract: Contract = {
  ...flexContract,
  id: 'contract-hmo-b',
  clientId: 'hmo-b',
  pricingModel: 'payg',
  platformFeeKobo: 25_000_000,
  rates: { coordinator_resolved: 80_000, gp: 450_000, follow_up: 200_000, therapy: 1_200_000 },
};

export const unlimitedContract: Contract = {
  ...flexContract,
  id: 'contract-lagos',
  clientId: 'lagos-state',
  pricingModel: 'unlimited',
  startsOn: '2026-01-01',
  endsOn: '2026-12-31',
  pmpmKobo: 35_000,
  therapyAddonPmpmKobo: null,
  rates: {},
};
