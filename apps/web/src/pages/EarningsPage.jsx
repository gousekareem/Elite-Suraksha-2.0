import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import { useAsync, Loading, ErrorBox, SeverityBadge, Empty } from '../components/ui';
import EarningsChart from '../components/charts/EarningsChart';
import BreakdownColumns from '../components/charts/BreakdownColumns';
import { inr, pct, dLong, dShort } from '../lib/format';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const segLabel = (k) => { const [d, w, z] = k.split('|'); const [a, b] = w.split('-'); return `${DAY[CODES.indexOf(d)]} ${a}:00–${b}:00 · ${z}`; };

const SessionAnalysis = ({ sessionId }) => {
  const scope = useScope();
  const a = useAsync(() => api.get(`${scope.api}/earnings/sessions/${sessionId}/analysis`), [sessionId]);
  if (a.loading) return <Loading label="Finding comparable shifts…" />;
  if (a.error) return <ErrorBox error={a.error} />;
  const { current, baseline, comparables, evaluation, platformEvents } = a.data;
  return (
    <div className="fade">
      <div className="row between"><h2>{dLong(current.date)} · {current.window}</h2><SeverityBadge severity={evaluation.severity} /></div>
      <p className="small dim" style={{ margin: '6px 0 10px' }}>{evaluation.explanation}</p>
      <div className="grid g4">
        <div><div className="eyebrow">Net</div><b className="num">{inr(current.net)}</b></div>
        <div><div className="eyebrow">Baseline</div><b className="num">{inr(baseline.net.median)}</b> <span className="tiny muted">n={baseline.sampleSize}</span></div>
        <div><div className="eyebrow">Orders</div><b className="num">{current.orders}</b> <span className="tiny muted">usual {baseline.orders.min}–{baseline.orders.max}</span></div>
        <div><div className="eyebrow">Per hour</div><b className="num">{inr(current.perHour)}</b></div>
      </div>
      <div className="eyebrow mt" style={{ marginBottom: 4 }}>Signals</div>
      <div className="table-wrap"><table className="t"><tbody>
        {evaluation.signals.map((s) => <tr key={s.key}><td>{s.label}</td><td><span className={`badge ${s.status === 'normal' ? 'b-good' : 'b-warn'}`}>{s.status}</span></td><td className="small dim">{s.detail}</td></tr>)}
      </tbody></table></div>
      {evaluation.decomposition ? (
        <>
          <div className="eyebrow mt" style={{ marginBottom: 4 }}>Change vs baseline average, by component</div>
          <div className="stack" style={{ gap: 4 }}>
            {evaluation.decomposition.parts.map((p) => (
              <div key={p.key} className="row" style={{ gap: 8 }}><span className="small" style={{ width: 110 }}>{p.label}</span>
                <div style={{ flex: 1, height: 10, position: 'relative', background: 'var(--surface-2)', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: p.amount < 0 ? `${50 - Math.min(50, Math.abs(p.amount) / 6)}%` : '50%', width: `${Math.min(50, Math.abs(p.amount) / 6)}%`, height: '100%', background: p.amount < 0 ? 'var(--critical)' : 'var(--good)', borderRadius: 4 }} />
                </div><span className="num small" style={{ width: 70, textAlign: 'right' }}>{inr(p.amount)}</span></div>
            ))}
          </div>
        </>
      ) : null}
      <div className="eyebrow mt" style={{ marginBottom: 4 }}>Comparable shifts</div>
      {comparables.length ? (
        <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th className="r">Orders</th><th className="r">Net</th><th className="r">Incentive</th><th>Why comparable</th></tr></thead><tbody>
          {comparables.map((c) => <tr key={c.sessionId}><td>{dShort(c.date)}</td><td className="r num">{c.orders}</td><td className="r num">{inr(c.net)}</td><td className="r num">{inr(c.incentive)}</td><td className="small dim">{c.reasons.join(', ')}</td></tr>)}
        </tbody></table></div>
      ) : <div className="small muted">No comparable shifts yet.</div>}
      {platformEvents.length ? <div className="mt small"><b>Platform events nearby:</b> {platformEvents.map((e) => `${dShort(e.localDate)} — ${e.title}`).join(' · ')}</div> : null}
      <div className="row mt"><Link className="btn primary sm" to={`${scope.link}/ask?q=${encodeURIComponent(`Why did my earnings drop on ${dShort(current.date)}?`)}`}>Ask the agent about this shift →</Link></div>
    </div>
  );
};

const EarningsPage = () => {
  const scope = useScope();
  const { profile } = useWorker();
  const [params, setParams] = useSearchParams();
  const series = useAsync(() => api.get(`${scope.api}/earnings/series`, { days: 120 }), [scope.api, profile?.asOfDate]);
  const points = series.data?.points || [];
  const segments = useMemo(() => {
    const c = {};
    points.forEach((p) => { c[p.segmentKey] = (c[p.segmentKey] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [points]);
  const [segment, setSegment] = useState('');
  const selected = params.get('session');
  useEffect(() => {
    if (!segments.length) return;
    const sel = points.find((p) => p.sessionId === selected);
    if (sel) setSegment(sel.segmentKey);
    else if (!segment || !segments.includes(segment)) setSegment(segments.find((s) => s.startsWith('FRI')) || segments[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.join(','), selected]);

  if (series.loading && !series.data) return <Loading label="Loading earnings…" />;
  if (series.error) return <ErrorBox error={series.error} onRetry={series.reload} />;
  if (!points.length) return <Empty title="No earnings recorded yet">Load history from the Judge Demo or import statements.</Empty>;
  const segPoints = points.filter((p) => p.segmentKey === segment);

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Earnings analytics</div><h1>Earnings against your personal baseline</h1><p>Shifts are compared like-for-like: same weekday, time window and zone. Baselines exclude sessions already flagged as significant anomalies.</p></div>
        <label className="field" style={{ minWidth: 260 }}>Shift segment
          <select className="select" value={segment} onChange={(e) => { setSegment(e.target.value); setParams({}); }}>{segments.map((s) => <option key={s} value={s}>{segLabel(s)}</option>)}</select>
        </label>
      </div>
      <div className="grid g3">
        <div className="card span2">
          <div className="card-head"><h2>Net earnings per shift · {segment ? segLabel(segment) : ''}</h2><span className="small muted">{dShort(series.data.from)} – {dShort(series.data.asOf)}</span></div>
          <EarningsChart points={segPoints} onSelect={(p) => setParams({ session: p.sessionId })} />
          <h2 className="mt2" style={{ fontSize: 14 }}>What each shift was made of</h2>
          <BreakdownColumns points={segPoints} />
        </div>
        <div className="card">
          {selected ? <SessionAnalysis sessionId={selected} /> : <Empty title="Select a shift">Click any point on the chart or a row in the table to see its baseline, signals and comparable shifts.</Empty>}
        </div>
      </div>
      <div className="card mt">
        <div className="card-head"><h2>All shifts in this segment</h2><span className="small muted">Table view of the chart data</span></div>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Date</th><th className="r">Orders</th><th className="r">Base</th><th className="r">Incentive</th><th className="r">Tips</th><th className="r">Deductions</th><th className="r">Net</th><th className="r">Baseline</th><th className="r">Δ</th><th>State</th></tr></thead>
          <tbody>{[...segPoints].reverse().map((p) => (
            <tr key={p.sessionId} className={p.anomaly && p.anomaly.severity === 'INVESTIGATION_RECOMMENDED' ? 'hl' : ''} style={{ cursor: 'pointer' }} onClick={() => setParams({ session: p.sessionId })}>
              <td>{dLong(p.date)}</td><td className="r num">{p.orders}</td><td className="r num">{inr(p.basePay)}</td><td className="r num">{inr(p.incentive)}</td><td className="r num">{inr(p.tips)}</td><td className="r num">{inr(-p.deductions)}</td><td className="r num"><b>{inr(p.net)}</b></td><td className="r num">{inr(p.baselineMedian)}</td><td className="r num">{pct(p.deviationPct, 1)}</td><td>{p.anomaly ? <SeverityBadge severity={p.anomaly.severity} /> : <span className="tiny muted">normal</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
};

export default EarningsPage;
