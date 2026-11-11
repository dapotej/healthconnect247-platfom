import { balance, averageDailyUsage, contractOn, daysOfCreditLeft, isLowBalance, lagosDate, type Contract } from '@hc247/core';
import type { NavItem } from '@/components/Shell';
import { isOverdue, owedKobo } from './billing';
import type { BillingConsultation, Client, DataSource, Invoice, MemberCounts } from './data/types';
import { addDays } from './period';

export const ADMIN_NAV: NavItem[] = [
  { key: 'overview', href: '/admin', label: 'Overview' },
  { key: 'clients', href: '/admin/clients', label: 'Clients' },
];

export interface ClientSummary {
  client: Client;
  contract: Contract;
  members: MemberCounts;
  consultations: BillingConsultation[];
  usageKobo: number;
  creditKobo: number | null;
  creditDaysLeft: number | null;
  lowCredit: boolean;
  invoices: Invoice[];
  owedKobo: number;
  overdue: Invoice[];
}

/** Per-client figures for a period, read through the billing view (no diagnoses). */
export async function clientSummaries(data: DataSource, from: string, to: string, nowIso: string): Promise<ClientSummary[]> {
  const today = lagosDate(nowIso);
  const [clients, consultations, invoices] = await Promise.all([
    data.listClients(),
    data.billingConsultations(from, to),
    data.invoices(),
  ]);
  return Promise.all(
    clients.map(async (client) => {
      const contracts = await data.contractsFor(client.id);
      const contract = contractOn(contracts, nowIso) ?? contracts[0]!;
      const members = await data.memberCounts(client.id);
      const mine = consultations.filter((c) => c.clientId === client.id);
      const theirInvoices = invoices.filter((i) => i.clientId === client.id);
      let creditKobo: number | null = null;
      let creditDaysLeft: number | null = null;
      let lowCredit = false;
      if (contract.pricingModel === 'flex') {
        const ledger = await data.creditLedger(client.id);
        creditKobo = balance(ledger);
        creditDaysLeft = daysOfCreditLeft(creditKobo, averageDailyUsage(ledger, addDays(today, -6), today));
        lowCredit = isLowBalance(creditKobo, contract.lowBalanceThresholdKobo) || (creditDaysLeft ?? 99) <= 7;
      }
      return {
        client,
        contract,
        members,
        consultations: mine,
        usageKobo: mine.reduce((s, c) => s + c.chargeKobo, 0),
        creditKobo,
        creditDaysLeft,
        lowCredit,
        invoices: theirInvoices,
        owedKobo: theirInvoices.reduce((s, i) => s + owedKobo(i), 0),
        overdue: theirInvoices.filter((i) => isOverdue(i, today)),
      };
    }),
  );
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
