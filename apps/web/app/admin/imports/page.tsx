import { Shell } from '@/components/Shell';
import { Notice } from '@/components/Notice';
import { PageHead } from '@/components/Widgets';
import { importConsultationsAction } from '@/app/admin/actions';
import { ADMIN_NAV } from '@/lib/admin';
import { getData } from '@/lib/data';
import { formatLagosDateTime, formatNumber } from '@/lib/format';
import { can, requireStaff } from '@/lib/session';
import { SubmitButton } from './SubmitButton';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOT_FINISHED = /^Not finished yet/;

export default async function ImportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const params = await searchParams;
  const data = getData();
  const [imports, clients] = await Promise.all([data.consultationImports(10), data.listClients()]);
  const allowed = can.importConsultations(user);
  const unnamed = clients.filter((c) => c.emrNames.length === 0);

  return (
    <Shell product="Admin console" user={user} nav={ADMIN_NAV} active="imports">
      <PageHead title="Consultation imports" subtitle="From the EMR's encounters export" />
      <Notice params={params} />

      <div className="grid-main-side">
        <section className="stack" style={{ gap: 16 }}>
          {imports.length === 0 && <p className="banner info" style={{ margin: 0 }}>No imports yet.</p>}
          {imports.map((imp, i) => {
            const pending = imp.problems.filter((p) => NOT_FINISHED.test(p.problem));
            const problems = imp.problems.filter((p) => !NOT_FINISHED.test(p.problem));
            return (
              <article key={imp.id} className="card" data-import={i === 0 ? 'latest' : undefined}>
                <div className="card-head">
                  <h2 style={{ margin: 0, fontSize: 16 }}>{imp.filename}</h2>
                  <span className="small muted">{formatLagosDateTime(imp.importedAt)}</span>
                </div>
                <dl className="facts">
                  <div><dt>Rows in file</dt><dd>{formatNumber(imp.rowsTotal)}</dd></div>
                  <div><dt>Imported</dt><dd className="strong">{formatNumber(imp.imported)}</dd></div>
                  <div><dt>Already imported</dt><dd>{formatNumber(imp.skippedDuplicates)}</dd></div>
                  <div><dt>Not finished yet</dt><dd>{formatNumber(pending.length)}</dd></div>
                  <div><dt>Need attention</dt><dd>{formatNumber(problems.length)}</dd></div>
                </dl>
                {problems.length > 0 && (
                  <details open={i === 0}>
                    <summary className="small strong">Rows that need attention</summary>
                    <div className="table-wrap">
                      <table className="data">
                        <thead><tr><th className="num">Row</th><th>Encounter</th><th>Problem</th></tr></thead>
                        <tbody>
                          {problems.slice(0, 200).map((p) => (
                            <tr key={`${p.row}-${p.name}`}><td className="num">{p.row}</td><td>{p.name}</td><td>{p.problem}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                {pending.length > 0 && (
                  <p className="small muted" style={{ margin: 0 }}>
                    {formatNumber(pending.length)} encounter{pending.length === 1 ? ' is' : 's are'} still open in the EMR. Import a later export once they’re closed; anything already imported is skipped.
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <aside className="stack" style={{ gap: 16 }}>
          {allowed ? (
            <form action={importConsultationsAction} className="card stack" style={{ gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Import an EMR export</h2>
              <div className="dropzone">
                <label htmlFor="emr-file" className="strong">Choose the encounters export (.xlsx or .csv)</label>
                <input id="emr-file" name="file" type="file" accept=".xlsx,.csv" required />
              </div>
              <SubmitButton label="Import" busy="Importing…" />
              <p className="small muted" style={{ margin: 0 }}>
                Only the encounter ID, date, client, patient code, phone, type, channel, status, doctor, ICD-11 code and outcome
                are read. Clinical notes in the file are ignored and never stored.
              </p>
            </form>
          ) : (
            <p className="banner info" style={{ margin: 0 }}>Operations admins import consultations.</p>
          )}
          {unnamed.length > 0 && (
            <div className="banner warn" style={{ margin: 0 }}>
              {unnamed.length === 1 ? '1 client has' : `${unnamed.length} clients have`} no EMR name yet, so their consultations
              can’t be matched: {unnamed.map((c) => c.name).join(', ')}. Add the name on the client’s page.
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}
