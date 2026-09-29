import { useState } from 'react';
import { useWidth, niceMax } from './useWidth';
import { inr, dShort, dLong } from '../../lib/format';

const PARTS = [
  { key: 'basePay', label: 'Base pay', color: 'var(--series-1)' },
  { key: 'incentive', label: 'Incentive', color: 'var(--series-2)' },
  { key: 'tips', label: 'Tips', color: 'var(--series-3)' }
];

/** Stacked columns: what each session's gross was made of. A missing incentive is visible at a glance. */
const BreakdownColumns = ({ points = [], height = 220 }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!points.length) return <div ref={ref} />;
  const m = { t: 10, r: 10, b: 26, l: 52 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const max = niceMax(Math.max(...points.map((p) => p.basePay + p.incentive + p.tips)));
  const band = w / points.length;
  const bw = Math.max(4, Math.min(28, band - 4));
  const y = (v) => (v / max) * h;
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 60))));
  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label="Earnings composition per session" onMouseLeave={() => setHover(null)} style={{ display: 'block' }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line x1={m.l} x2={width - m.r} y1={m.t + h - f * h} y2={m.t + h - f * h} stroke="var(--grid)" />
            <text x={m.l - 8} y={m.t + h - f * h + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{inr(f * max)}</text></g>
        ))}
        {points.map((p, i) => {
          let acc = 0;
          const cx = m.l + band * i + (band - bw) / 2;
          return (
            <g key={p.sessionId} onMouseEnter={() => setHover(i)}>
              <rect x={m.l + band * i} y={m.t} width={band} height={h} fill="transparent" />
              {PARTS.map((part) => {
                const v = p[part.key];
                if (!v) return null;
                const hh = Math.max(0, y(v) - 2);
                const top = m.t + h - y(acc) - y(v);
                acc += v;
                return <rect key={part.key} x={cx} y={top} width={bw} height={hh} rx={part.key === 'tips' || (part.key === 'incentive' && !p.tips) ? 3 : 0} fill={part.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {i % every === 0 ? <text x={cx + bw / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-3)">{dShort(p.date)}</text> : null}
            </g>
          );
        })}
      </svg>
      {hp ? (
        <div className="tooltip" style={{ left: Math.min(m.l + band * hover + band, width - 190), top: 8 }}>
          <b>{dLong(hp.date)}</b>
          {PARTS.map((p) => <div key={p.key} className="row between num"><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: p.color }} />{p.label}</span><span>{inr(hp[p.key])}</span></div>)}
          <div className="row between num"><span className="muted">Deductions</span><span>{inr(-hp.deductions)}</span></div>
          <div className="row between num"><b>Net</b><b>{inr(hp.net)}</b></div>
          {hp.incentiveNote && hp.incentive === 0 ? <div className="tiny muted">Incentive note: “{hp.incentiveNote}”</div> : null}
        </div>
      ) : null}
      <div className="row small muted" style={{ gap: 16, marginTop: 6 }}>
        {PARTS.map((p) => <span key={p.key} className="row" style={{ gap: 6 }}><span className="dot" style={{ background: p.color }} />{p.label}</span>)}
      </div>
    </div>
  );
};

export default BreakdownColumns;
