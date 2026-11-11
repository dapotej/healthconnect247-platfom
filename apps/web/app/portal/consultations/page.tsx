import { CONSULTATION_TYPES, OUTCOMES } from '@hc247/core';
import { Shell } from '@/components/Shell';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PageHead } from '@/components/Widgets';
import { applyFilters, readFilters } from '@/lib/consultations';
import { formatLagosDateTime, formatNaira, formatNumber, OUTCOME_LABELS, TYPE_LABELS } from '@/lib/format';
import { periodQuery, resolvePeriod } from '@/lib/period';
import { portalContext, portalNav } from '@/lib/portal';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE_SIZE = 25;

export default async function ConsultationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, data, client, nowIso } = await portalContext();
  const params = await searchParams;
  const period = resolvePeriod(params, nowIso);
  const filters = readFilters(params);
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);

  const rows = applyFilters(await data.clientConsultations(client.id, period.from, period.to), filters);
  const total = rows.reduce((s, c) => s + c.chargeKobo, 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const keep = { type: filters.type ?? undefined, outcome: filters.outcome ?? undefined, q: filters.q || undefined };
  const query = new URLSearchParams(periodQuery(period));
  for (const [k, v] of Object.entries(keep)) if (v) query.set(k, v);
  const pageLink = (p: number) => `/portal/consultations?${query.toString()}&page=${p}`;

  return (
    <Shell product="Client portal" clientName={client.name} user={user} nav={portalNav(user)} active="consultations">
      <PageHead
        title="Consultations"
        subtitle={
          <>
            Showing {period.label} · <b>{formatNumber(rows.length)}</b> consultations · <b>{formatNaira(total)}</b>
          </>
        }
      >
        <a className="btn btn-primary" href={`/portal/consultations/export?${query.toString()}`}>
          Export this period for claims (CSV)
        </a>
      </PageHead>

      <div className="toolbar">
        <PeriodPicker period={period} basePath="/portal/consultations" keep={keep} />
        <form method="get" action="/portal/consultations" className="filters">
          {period.key === 'custom' ? (
            <>
              <input type="hidden" name="period" value="custom" />
              <input type="hidden" name="from" value={period.from} />
              <input type="hidden" name="to" value={period.to} />
            </>
          ) : (
            <input type="hidden" name="period" value={period.key} />
          )}
          <label className="small muted" htmlFor="f-type">Type</label>
          <select id="f-type" className="input" name="type" defaultValue={filters.type ?? ''}>
            <option value="">All types</option>
            {CONSULTATION_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <label className="small muted" htmlFor="f-outcome">Outcome</label>
          <select id="f-outcome" className="input" name="outcome" defaultValue={filters.outcome ?? ''}>
            <option value="">All outcomes</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
            ))}
          </select>
          <label className="small muted" htmlFor="f-q">Member</label>
          <input id="f-q" className="input" name="q" defaultValue={filters.q} placeholder="Name or member ID" />
          <button className="btn btn-small" type="submit">Apply</button>
        </form>
      </div>

      <section className="card flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date and time</th>
                <th>Member</th>
                <th>Type</th>
                <th>Clinician</th>
                <th>Diagnosis (ICD-10)</th>
                <th>Outcome</th>
                <th className="num">Charge</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatLagosDateTime(c.occurredAt)}</td>
                  <td>
                    <span className="strong">{c.memberName}</span>
                    <br />
                    <span className="muted">{c.externalMemberId}</span>
                  </td>
                  <td>{TYPE_LABELS[c.type]}</td>
                  <td>{c.clinicianName ?? '—'}</td>
                  {c.type === 'therapy' ? (
                    <td className="restricted">Not shared</td>
                  ) : (
                    <td>{c.icd10Code ? `${c.icd10Code} · ${c.diagnosisLabel ?? ''}` : '—'}</td>
                  )}
                  <td>{c.outcome ? OUTCOME_LABELS[c.outcome] : '—'}</td>
                  <td className="num strong">{formatNaira(c.chargeKobo)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">No consultations in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>
            Page {page} of {pages}. The export adds visit IDs, channel, language and clinician licence numbers. Therapy diagnoses and clinical notes are never shared.
          </span>
          <span className="pager">
            {page > 1 && <a href={pageLink(page - 1)}>Previous</a>}
            {page < pages && <a href={pageLink(page + 1)}>Next</a>}
          </span>
        </div>
      </section>
    </Shell>
  );
}
