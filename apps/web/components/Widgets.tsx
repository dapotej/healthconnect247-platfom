import type { ReactNode } from 'react';

export function Kpi(props: { label: string; value: string; note?: string; tone?: 'warn' }) {
  return (
    <div className={`kpi${props.tone === 'warn' ? ' warn' : ''}`}>
      <span className="label">{props.label}</span>
      <span className="value">{props.value}</span>
      {props.note && <span className="note">{props.note}</span>}
    </div>
  );
}

export function PageHead(props: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack" style={{ gap: 2 }}>
        <h1>{props.title}</h1>
        {props.subtitle && <span className="subtitle">{props.subtitle}</span>}
      </div>
      {props.children && <div className="toolbar">{props.children}</div>}
    </div>
  );
}

/** Simple bar chart drawn with HTML, so it scales and reads well on any screen. */
export function BarChart(props: { label: string; bars: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...props.bars.map((b) => b.value));
  const showValues = props.bars.length <= 16;
  const labelEvery = Math.ceil(props.bars.length / 12);
  const lo = Math.min(...props.bars.map((b) => b.value));
  return (
    <>
      <div className="bars" role="img" aria-label={`${props.label}: between ${lo} and ${max} a day.`}>
        {props.bars.map((b) => (
          <div className="bar" key={b.label}>
            {showValues && <span>{b.value}</span>}
            <div style={{ height: `${Math.round((b.value / max) * 85)}%` }} />
          </div>
        ))}
      </div>
      <div className="bar-labels" aria-hidden="true">
        {props.bars.map((b, i) => (
          <span key={b.label}>{i % labelEvery === 0 ? b.label : ''}</span>
        ))}
      </div>
    </>
  );
}

export function Meter(props: { label: string; value: string; share: number; tone?: 'blue' }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row-between">
        <span>{props.label}</span>
        <b>{props.value}</b>
      </div>
      <div className={`meter${props.tone === 'blue' ? ' blue' : ''}`}>
        <span style={{ width: `${Math.max(0, Math.min(100, Math.round(props.share * 100)))}%` }} />
      </div>
    </div>
  );
}
