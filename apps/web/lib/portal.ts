import { balance, averageDailyUsage, daysOfCreditLeft, isLowBalance, contractOn, lagosDate, type Contract } from '@hc247/core';
import { getData, now } from './data';
import { addDays } from './period';
import { canSeeInvoices, requireClientUser, type SessionUser } from './session';
import type { NavItem } from '@/components/Shell';
import type { Client } from './data/types';

export function portalNav(user: SessionUser): NavItem[] {
  const items: NavItem[] = [
    { key: 'dashboard', href: '/portal', label: 'Dashboard' },
    { key: 'members', href: '/portal/members', label: 'Members' },
    { key: 'consultations', href: '/portal/consultations', label: 'Consultations' },
  ];
  if (canSeeInvoices(user)) items.push({ key: 'billing', href: '/portal/billing', label: 'Billing and credit' });
  return items;
}

export interface CreditStatus {
  balanceKobo: number;
  dailyUsageKobo: number;
  daysLeft: number | null;
  low: boolean;
}

/** Everything a portal page needs to know about the signed-in client. */
export async function portalContext() {
  const user = await requireClientUser();
  const data = getData();
  const client = (await data.getClient(user.clientId)) as Client;
  const nowIso = now();
  const contracts = await data.contractsFor(user.clientId);
  const contract = contractOn(contracts, nowIso) ?? (contracts[0] as Contract);
  let credit: CreditStatus | null = null;
  if (contract.pricingModel === 'flex') {
    const ledger = await data.creditLedger(user.clientId);
    const today = lagosDate(nowIso);
    const daily = averageDailyUsage(ledger, addDays(today, -6), today);
    const bal = balance(ledger);
    credit = {
      balanceKobo: bal,
      dailyUsageKobo: daily,
      daysLeft: daysOfCreditLeft(bal, daily),
      low: isLowBalance(bal, contract.lowBalanceThresholdKobo) || (daysOfCreditLeft(bal, daily) ?? 99) <= 7,
    };
  }
  return { user, data, client, contract, credit, nowIso };
}
