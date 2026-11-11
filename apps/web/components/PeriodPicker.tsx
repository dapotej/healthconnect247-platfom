import { PERIOD_OPTIONS, type Period } from '@/lib/period';

/**
 * Period selector shared by every reporting page. Plain links and a GET form,
 * so it works without JavaScript and every view has a shareable URL.
 */
export function PeriodPicker({
  period,
  basePath,
  keep = {},
}: {
  period: Period;
  basePath: string;
  /** Other query parameters to keep (filters, search). */
  keep?: Record<string, string | undefined>;
}) {
  const extra = Object.entries(keep).filter((e): e is [string, string] => Boolean(e[1]));
  const href = (key: string) => {
    const q = new URLSearchParams([...extra, ['period', key]]);
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="toolbar">
      <div className="seg" role="group" aria-label="Period">
        {PERIOD_OPTIONS.map((o) => (
          <a key={o.key} href={href(o.key)} aria-current={period.key === o.key ? 'true' : undefined}>
            {o.label}
          </a>
        ))}
      </div>
      <details className="date-pop">
        <summary aria-label={`Choose custom dates, currently ${period.label}`}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          {period.label}
        </summary>
        <form method="get" action={basePath}>
          {extra.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="period" value="custom" />
          <label>
            From
            <input className="input" type="date" name="from" defaultValue={period.from} required />
          </label>
          <label>
            To
            <input className="input" type="date" name="to" defaultValue={period.to} required />
          </label>
          <button className="btn btn-primary btn-small" type="submit">
            Show these dates
          </button>
        </form>
      </details>
    </div>
  );
}
