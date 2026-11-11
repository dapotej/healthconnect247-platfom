import { buildInvoice } from '@hc247/core';
import { describe, expect, it } from 'vitest';
import { collectedBetween, invoiceBadge, isOverdue, owedKobo } from '@/lib/billing';
import { demoDataSource as data } from '@/lib/data/demo';
import { DataRuleError } from '@/lib/data/types';
import { noticeFor } from '@/lib/notices';

const rule = (code: string) => expect.objectContaining({ name: 'DataRuleError', code });

describe('invoices', () => {
  it('shows [HMO B]’s October invoice as overdue on 10 November', async () => {
    const inv = (await data.getInvoice('INV-0142'))!;
    expect(isOverdue(inv, '2026-11-10')).toBe(true);
    expect(invoiceBadge(inv, '2026-11-10').text).toMatch(/^Overdue 21 days/);
  });

  it('records part and full payments, and refuses overpayment', async () => {
    const inv = (await data.getInvoice('INV-0149'))!;
    const total = inv.totalKobo;
    await data.recordPayment(inv.id, { amountKobo: 10_000_000, paidOn: '2026-11-08', reference: 'T1' });
    expect(inv.status).toBe('part_paid');
    expect(owedKobo(inv)).toBe(total - 10_000_000);
    await expect(data.recordPayment(inv.id, { amountKobo: total, paidOn: '2026-11-09', reference: 'T2' })).rejects.toEqual(rule('overpayment'));
    await data.recordPayment(inv.id, { amountKobo: total - 10_000_000, paidOn: '2026-11-09', reference: 'T3' });
    expect(inv.status).toBe('paid');
    expect(inv.paidOn).toBe('2026-11-09');
    expect(collectedBetween([inv], '2026-11-09', '2026-11-09')).toBe(total - 10_000_000);
  });

  it('refuses payment on an invoice that hasn’t been sent', async () => {
    await expect(data.recordPayment('INV-0156', { amountKobo: 100, paidOn: '2026-11-08', reference: 'X' })).rejects.toEqual(rule('not_sent'));
  });

  it('numbers new invoices in sequence and refuses a second one for the same month', async () => {
    const [contract] = await data.contractsFor('hmo-d');
    const draft = buildInvoice({ contract: contract!, periodStart: '2026-12-01', periodEnd: '2026-12-31', consultations: [] });
    const inv = await data.createInvoiceDraft('hmo-d', draft);
    expect(inv.number).toBe('INV-0157');
    expect(inv.status).toBe('draft');
    await expect(data.createInvoiceDraft('hmo-d', draft)).rejects.toBeInstanceOf(DataRuleError);
    const sent = await data.sendInvoice(inv.id, '2026-11-24');
    expect(sent).toMatchObject({ status: 'sent', dueOn: '2026-11-24' });
    await expect(data.sendInvoice(inv.id, '2026-11-24')).rejects.toEqual(rule('not_draft'));
  });
});

describe('Flex top-ups', () => {
  it('adds credit for Flex clients only', async () => {
    const before = (await data.creditLedger('hmo-c')).length;
    await data.recordTopUp('hmo-c', { amountKobo: 200_000_000, receivedOn: '2026-11-10', reference: 'TRF-9' });
    expect(await data.creditLedger('hmo-c')).toHaveLength(before + 1);
    await expect(data.recordTopUp('hmo-b', { amountKobo: 100, receivedOn: '2026-11-10', reference: 'X' })).rejects.toEqual(rule('not_flex'));
  });
});

describe('staff and members', () => {
  it('invites staff once per email', async () => {
    const m = await data.inviteStaff({ fullName: 'Test Person', email: 'Test@Example.com', role: 'coordinator', languages: ['english'], licenceNumber: null, licenceExpiresOn: null });
    expect(m.status).toBe('invited');
    await expect(
      data.inviteStaff({ fullName: 'Again', email: 'test@example.com', role: 'gp', languages: ['english'], licenceNumber: 'M', licenceExpiresOn: '2027-01-01' }),
    ).rejects.toEqual(rule('staff_exists'));
  });

  it('suspends and reactivates a member, only within their client', async () => {
    const { rows } = await data.searchMembers('hmo-b', { filter: 'active', offset: 0, limit: 1 });
    const member = rows[0]!;
    await data.setMemberStatus('hmo-b', member.id, 'suspended');
    expect(member.status).toBe('suspended');
    await data.setMemberStatus('hmo-b', member.id, 'active');
    expect(member.status).toBe('active');
    await expect(data.setMemberStatus('hmo-a', member.id, 'suspended')).rejects.toEqual(rule('member_not_found'));
  });
});

describe('notices', () => {
  it('shows only known messages, never text from the address bar', () => {
    expect(noticeFor({ notice: 'drafts_created', n: '3' })?.text).toMatch(/^3 invoices created/);
    expect(noticeFor({ notice: 'drafts_created', n: '<script>' })?.text).toMatch(/^New invoices created/);
    expect(noticeFor({ notice: 'Your account is locked, call 0800…' })).toBeNull();
  });
});
