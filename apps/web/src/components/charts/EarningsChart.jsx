import { useState } from 'react';
import { useWidth, niceMax } from './useWidth';
import { inr, dShort, dLong, pct, SEVERITY } from '../../lib/format';

const MARK = { INVESTIGATION_RECOMMENDED: 'var(--critical)', SIGNIFICANT_CHANGE: 'var(--serious)', WATCH: 'var(--warn)' };

/**
 * Net earnings per session (line) against the personal baseline median (dashed),
 * with anomaly markers. Single y-axis (₹). Crosshair tooltip on hover.
 */
const EarningsChart = ({ points = [], height = 260, onSelect }) => {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!points.length) return <div ref={ref} className="empty"><b>No sessions in this range</b></div>;

  const m = { t: 14, r: 16, b: 28, l: 56 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.net, p.baselineMedian || 0))) * 1.08);
  const x = (i) => m.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v) => m.t + h - (v / max) * h;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join('');
  let base = '';
  points.forEach((p, i) => { if (p.baselineMedian !== null) base += `${base && points[i - 1]?.baselineMedian !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.baselineMedian).toFixed(1)}`; });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 70))));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / w) * (points.length - 1))));
    setHover(i);
  };
  const hp = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label="Net earnings per session compared with personal baseline"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => hp && onSelect?.(hp)} style={{ display: 'block', cursor: onSelect ? 'pointer' : 'default' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="num">{inr(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % labelEvery === 0 ? <text key={p.sessionId} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-3)">{dShort(p.date)}</text> : null))}
        {base ? <path d={base} fill="none" stroke="var(--axis)" strokeWidth="2" strokeDasharray="5 4" /> : null}
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (p.anomaly && MARK[p.anomaly.severity] ? (
          <g key={`a-${p.sessionId}`}>
            <circle cx={x(i)} cy={y(p.net)} r="7" fill={MARK[p.anomaly.severity]} stroke="var(--surface)" strokeWidth="2" />
            <text x={x(i)} y={y(p.net) + 3.5} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{SEVERITY[p.anomaly.severity].icon}</text>
          </g>
        ) : <circle key={`p-${p.sessionId}`} cx={x(i)} cy={y(p.net)} r={hover === i ? 5 : 3} fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />))}
        {hp ? <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + h} stroke="var(--border-strong)" /> : null}
      </svg>
      {hp ? (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 200), top: 8 }}>
          <b>{dLong(hp.date)}</b> <span className="muted">{hp.window}</span>
          <div className="row between num"><span className="muted">Net</span><b>{inr(hp.net)}</b></div>
          <div className="row between num"><span className="muted">Baseline</span><span>{inr(hp.baselineMedian)}</span></div>
          <div className="row between num"><span className="muted">Orders</span><span>{hp.orders}</span></div>
          <div className="row between num"><span className="muted">Incentive</span><span>{inr(hp.incentive)}</span></div>
          {hp.deviationPct !== null ? <div className="row between num"><span className="muted">vs baseline</span><span>{pct(hp.deviationPct, 1)}</span></div> : null}
          {hp.anomaly ? <div className="tiny" style={{ color: MARK[hp.anomaly.severity], fontWeight: 700 }}>{SEVERITY[hp.anomaly.severity].label}</div> : null}
        </div>
      ) : null}
      <div className="row small muted" style={{ gap: 16, marginTop: 6 }}>
        <span className="row" style={{ gap: 6 }}><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--series-1)" strokeWidth="2" /></svg>Net earnings</span>
        <span className="row" style={{ gap: 6 }}><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="var(--axis)" strokeWidth="2" strokeDasharray="5 4" /></svg>Personal baseline (median)</span>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--critical)' }} />Investigation recommended</span>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: 'var(--serious)' }} />Significant change</span>
      </div>
    </div>
  );
};

export default EarningsChart;
