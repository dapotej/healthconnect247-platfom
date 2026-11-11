import {
  contractOn,
  matchClient,
  matchMember,
  NotCoveredError,
  priceConsultation,
  type ConsultationParseResult,
  type RowError,
} from '@hc247/core';
import type { DataSource, ImportedConsultation } from './data/types';
import { TYPE_LABELS } from './format';

export interface EmrImportResult {
  id: string;
  filename: string;
  rowsTotal: number;
  imported: number;
  skippedDuplicates: number;
  pending: RowError[];
  problems: RowError[];
}

/**
 * Save a parsed EMR export: find each row's client (by its EMR name), member
 * (patient code, member ID, then phone) and contract in force that day, price
 * it, and save. Rows that can't be matched or priced are reported, not saved.
 * See docs/call-centre-import.md.
 */
export async function runEmrImport(data: DataSource, filename: string, parsed: ConsultationParseResult): Promise<EmrImportResult> {
  const problems: RowError[] = [...parsed.errors];
  const clients = await data.listClients();
  const clientNames = clients.map((c) => ({ id: c.id, names: c.emrNames }));
  const existing = await data.existingConsultationRefs(parsed.consultations.map((c) => c.externalRef));

  const contracts = new Map<string, Awaited<ReturnType<DataSource['contractsFor']>>>();
  const indexes = new Map<string, Parameters<typeof matchMember>[1]>();
  const ready: ImportedConsultation[] = [];
  const memberCodes = new Map<string, string>();
  let skippedDuplicates = 0;

  for (const c of parsed.consultations) {
    if (existing.has(c.externalRef)) {
      skippedDuplicates++;
      continue;
    }
    const problem = (text: string) => problems.push({ row: c.row, name: c.externalRef, problem: text });

    const client = matchClient(c.clientName, clientNames);
    if ('problem' in client) {
      problem(client.problem);
      continue;
    }
    const clientId = client.clientId;

    if (!indexes.has(clientId)) {
      const rows = await data.memberIndex(clientId);
      const byPhone = new Map<string, string[]>();
      for (const m of rows) byPhone.set(m.phoneE164, [...(byPhone.get(m.phoneE164) ?? []), m.id]);
      indexes.set(clientId, {
        byPatientCode: new Map(rows.filter((m) => m.patientCode).map((m) => [m.patientCode!, m.id])),
        byExternalId: new Map(rows.map((m) => [m.externalMemberId.toUpperCase(), m.id])),
        byPhone,
      });
    }
    const member = matchMember(c, indexes.get(clientId)!);
    if ('problem' in member) {
      problem(member.problem);
      continue;
    }

    if (!contracts.has(clientId)) contracts.set(clientId, await data.contractsFor(clientId));
    const contract = contractOn(contracts.get(clientId)!, c.occurredAt);
    if (!contract) {
      problem('No contract in force for this client on that day');
      continue;
    }
    let priced;
    try {
      priced = priceConsultation(contract, c.type);
    } catch (err) {
      if (err instanceof NotCoveredError) {
        problem(`${TYPE_LABELS[c.type]} isn't covered by this client's contract`);
        continue;
      }
      throw err;
    }

    if (c.patientCode && member.via !== 'patient_code') memberCodes.set(member.memberId, c.patientCode);
    ready.push({
      clientId,
      memberId: member.memberId,
      contractId: contract.id,
      externalRef: c.externalRef,
      occurredAt: c.occurredAt,
      type: c.type,
      channel: c.channel,
      language: c.language,
      clinicianName: c.clinicianName,
      clinicianLicence: c.clinicianLicence,
      diagnosisCode: c.diagnosisCode,
      diagnosisCodeSystem: c.diagnosisCodeSystem,
      diagnosisLabel: c.diagnosisLabel,
      outcome: c.outcome,
      chargeKobo: priced.chargeKobo,
      billing: priced.billing,
    });
  }

  problems.sort((a, b) => a.row - b.row);
  const saved = await data.recordConsultationImport({
    filename,
    rowsTotal: parsed.rowsTotal,
    consultations: ready,
    memberCodes: [...memberCodes].map(([memberId, patientCode]) => ({ memberId, patientCode })),
    problems: [...parsed.pending, ...problems].sort((a, b) => a.row - b.row),
    alreadyImported: skippedDuplicates,
  });
  return {
    id: saved.id,
    filename,
    rowsTotal: parsed.rowsTotal,
    imported: saved.imported,
    skippedDuplicates: saved.skippedDuplicates,
    pending: parsed.pending,
    problems,
  };
}
