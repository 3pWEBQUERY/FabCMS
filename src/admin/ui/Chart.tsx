import { useEffect, useRef, useState } from 'react';

/**
 * Daily bar chart for one measure (visitors). Single series → no legend box,
 * the card title names it. Bars: 2 px gap, 4 px rounded top, anchored to the
 * baseline. Hover shows a tooltip with the day's visitors and page views.
 */
export interface DayPoint {
  day: string;
  visitors: number;
  pageviews: number;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', opts);

export function VisitorsChart({ data, height = 220, label }: { data: DayPoint[]; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 34;
  const padB = 22;
  const padT = 8;
  const w = width - padL;
  const h = height - padB - padT;
  const max = niceMax(Math.max(1, ...data.map((d) => d.visitors)));
  const slot = data.length ? w / data.length : w;
  const gap = 2;
  const barW = Math.max(2, Math.min(28, slot - gap));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(w / 64)));
  const y = (v: number) => padT + h - (v / max) * h;

  const bar = (i: number, v: number) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const top = y(v);
    const bh = padT + h - top;
    if (bh <= 0) return '';
    const r = Math.min(4, barW / 2, bh);
    return `M${x},${padT + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${padT + h}Z`;
  };

  const hp = hover !== null ? data[hover] : null;
  const total = data.reduce((s, d) => s + d.visitors, 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`${label}: ${total} Besuche in ${data.length} Tagen`} onMouseLeave={() => setHover(null)}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end">
                {Math.round(t)}
              </text>
            </g>
          ))}
        </g>
        {hover !== null && <rect className="hover-col" x={padL + hover * slot} y={padT} width={slot} height={h} rx={3} />}
        {data.map((d, i) => (
          <path key={d.day} className="bar-v" d={bar(i, d.visitors)} />
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={`l-${d.day}`} x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle">
              {dayLabel(d.day, data.length > 14 ? { day: 'numeric', month: 'numeric' } : { weekday: 'short' })}
            </text>
          ) : null,
        )}
        {data.map((d, i) => (
          <rect key={`hit-${d.day}`} x={padL + i * slot} y={0} width={slot} height={height} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
        ))}
      </svg>
      {hp && hover !== null && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: Math.min(width - 150, Math.max(0, padL + hover * slot + slot / 2 - 70)),
            top: Math.max(0, y(hp.visitors) - 70),
            pointerEvents: 'none',
            background: 'var(--panel)',
            boxShadow: 'var(--shadow-2)',
            borderRadius: 8,
            padding: '0.45rem 0.65rem',
            fontSize: 'var(--t-xs)',
            minWidth: 140,
          }}
        >
          <div className="muted">{dayLabel(hp.day, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="row between">
            <span>Besuche</span>
            <strong className="num">{hp.visitors}</strong>
          </div>
          <div className="row between">
            <span>Seitenaufrufe</span>
            <strong className="num">{hp.pageviews}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal magnitude bars with the value as text (pages, sources). */
export function BarList({ rows, valueLabel }: { rows: { label: string; value: number; sub?: string }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="small muted" style={{ padding: '0.5rem 0.6rem' }}>Noch keine Daten.</p>;
  return (
    <div className="bars-h" role="table" aria-label={valueLabel}>
      {rows.map((r) => (
        <div className="bar-row" role="row" key={r.label}>
          <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          <span className="ellipsis" role="cell">
            {r.label}
          </span>
          <span className="num" role="cell" style={{ fontWeight: 600 }}>
            {r.value.toLocaleString('de-CH')}
          </span>
        </div>
      ))}
    </div>
  );
}
