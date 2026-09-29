import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiClient, errorMessage } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import { useAsync, Loading, ErrorBox, SeverityBadge, Empty } from '../components/ui';
import MemoryItem from '../components/MemoryItem';
import EvidenceTimeline from '../components/EvidenceTimeline';
import { inr, pct, dLong, dShort, STATUS, titleCase, timeAgo } from '../lib/format';

const ROOT_CAUSES = ['INCENTIVE_ELIGIBILITY_CHANGE', 'PAY_RATE_CHANGE', 'DEDUCTION_ERROR', 'LOW_DEMAND', 'PLATFORM_OUTAGE', 'DATA_ERROR', 'OTHER', 'UNRESOLVED'];
const KIND_CLS = { FACT: 'b-fact', INFERENCE: 'b-infer', UNKNOWN: 'b-unknown' };

const OutcomeForm = ({ inv, onDone }) => {
  const scope = useScope();
  const [f, setF] = useState({ result: '', rootCauseCategory: 'INCENTIVE_ELIGIBILITY_CHANGE', actionTaken: '', resolutionSource: 'Platform support response', learning: '', workerFeedback: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post(`${scope.api}/investigations/${inv.id}/resolve`, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))); onDone(); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="small dim">Record what actually happened. The outcome is saved in PostgreSQL and retained in Hindsight so future investigations can learn from it.</p>
      <label className="field">What was found / clarified<textarea className="textarea" value={f.result} onChange={set('result')} required maxLength={2000} /></label>
      <label className="field">Root cause<select className="select" value={f.rootCauseCategory} onChange={set('rootCauseCategory')}>{ROOT_CAUSES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</select></label>
      <label className="field">Action taken<textarea className="textarea" style={{ minHeight: 60 }} value={f.actionTaken} onChange={set('actionTaken')} required maxLength={2000} /></label>
      <label className="field">Source of resolution<input className="input" value={f.resolutionSource} onChange={set('resolutionSource')} /></label>
      <label className="field">Learning for next time (optional)<textarea className="textarea" style={{ minHeight: 60 }} value={f.learning} onChange={set('learning')} maxLength={2000} /></label>
      <label className="field">Your feedback (optional)<input className="input" value={f.workerFeedback} onChange={set('workerFeedback')} maxLength={2000} /></label>
      {err ? <div className="alert err">{err}</div> : null}
      <button className="btn memory" disabled={busy}>{busy ? <><span className="spinner" /> Saving outcome to memory…</> : 'Resolve & retain outcome in memory'}</button>
    </form>
  );
};

const InvestigationWorkspacePage = () => {
  const { id } = useParams();
  const scope = useScope();
  const { reload: reloadWorker } = useWorker();
  const inv = useAsync(() => api.get(`${scope.api}/investigations/${id}`), [scope.api, id]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [statement, setStatement] = useState('');
  const [file, setFile] = useState(null);

  const act = async (key, fn) => {
    setBusy(key); setMsg('');
    try { const m = await fn(); if (m) setMsg(m); await inv.reload(); reloadWorker(); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(''); }
  };

  if (inv.loading && !inv.data) return <Loading label="Building investigation workspace…" />;
  if (inv.error) return <ErrorBox error={inv.error} onRetry={inv.reload} />;
  const d = inv.data;
  const a = d.analysis || {};
  const cur = a.current || {};
  const base = a.baseline || {};
  const evIndex = Object.fromEntries(d.evidence.map((e, i) => [e.id, `E${i + 1}`]));
  const memories = d.memoryContext?.memories || [];
  const statements = d.evidence.filter((e) => ['WORKER_STATEMENT', 'ATTACHMENT'].includes(e.type)).map((e) => ({ date: e.localDate, kind: 'statement', title: e.title, detail: e.content?.detail || 'Attached file', evidenceId: e.id }));
  const timeline = [...(a.timeline || []), ...statements].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="row"><Link to={`${scope.link}/investigations`} className="small">← Investigations</Link></div>
          <div className="row" style={{ marginTop: 6 }}><h1>{d.caseNumber}</h1><span className={`badge ${STATUS[d.status]}`}>{titleCase(d.status)}</span>{d.anomaly ? <SeverityBadge severity={d.anomaly.severity} /> : null}{a.usedPreviousOutcome ? <span className="badge b-memory">🧠 uses a previous outcome</span> : null}</div>
          <p>{d.title} · question: “{d.question}”</p>
        </div>
        <div className="row no-print">
          {d.allowedTransitions.filter((s) => s !== 'CLOSED').map((s) => <button key={s} className="btn sm" disabled={!!busy} onClick={() => act('status', () => api.patch(`${scope.api}/investigations/${id}/status`, { status: s }).then(() => null))}>Mark {titleCase(s).toLowerCase()}</button>)}
          <button className="btn primary" disabled={!!busy} onClick={() => act('report', async () => { await api.post(`${scope.api}/investigations/${id}/reports`, {}); return 'Report generated.'; })}>{busy === 'report' ? 'Generating report…' : 'Generate report'}</button>
        </div>
      </div>
      {msg ? <div className="alert info" style={{ marginBottom: 12 }}>{msg}</div> : null}

      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="stack span2" style={{ gap: 14 }}>
          <div className="card">
            <div className="eyebrow">Case summary · what happened?</div>
            <p style={{ fontSize: 15, marginTop: 6 }}>{d.summary}</p>
            <div className="grid g4 mt">
              <div><div className="eyebrow">Current net</div><b className="num" style={{ fontSize: 18 }}>{inr(cur.net)}</b><div className="tiny muted">{dLong(cur.date)}</div></div>
              <div><div className="eyebrow">Baseline</div><b className="num" style={{ fontSize: 18 }}>{inr(base.net?.median)}</b><div className="tiny muted">{base.label} · n={base.sampleSize}</div></div>
              <div><div className="eyebrow">Deviation</div><b className="num delta-neg" style={{ fontSize: 18 }}>{pct(a.evaluation?.deviationPct, 1)}</b><div className="tiny muted">vs median</div></div>
              <div><div className="eyebrow">Orders</div><b className="num" style={{ fontSize: 18 }}>{cur.orders}</b><div className="tiny muted">usual {base.orders?.min}–{base.orders?.max}</div></div>
            </div>
            <div className="grid g4 mt small">
              <div>Base pay <b className="num">{inr(cur.basePay)}</b></div><div>Incentive <b className="num">{inr(cur.incentive)}</b></div><div>Tips <b className="num">{inr(cur.tips)}</b></div><div>Deductions <b className="num">{inr(-cur.deductions)}</b></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Findings</h2><span className="small muted">Every statement cites evidence (E#)</span></div>
            {['FACT', 'INFERENCE', 'UNKNOWN'].map((k) => {
              const list = d.findings.filter((f) => f.kind === k);
              return list.length ? (
                <div key={k} style={{ marginBottom: 8 }}>
                  {list.map((f) => (
                    <div key={f.id} className="finding">
                      <div><span className={`badge ${KIND_CLS[k]}`}>{k}</span>{f.confidence && k === 'INFERENCE' ? <div className="tiny muted" style={{ marginTop: 4 }}>{f.confidence.toLowerCase()} confidence</div> : null}</div>
                      <div>{f.statement} {f.evidenceIds.length ? <span className="tiny muted">[{f.evidenceIds.map((e) => evIndex[e]).filter(Boolean).join(', ')}]</span> : null}</div>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
          </div>

          <div className="card">
            <div className="card-head"><h2>Evidence timeline</h2><span className="small muted">Click an event to expand</span></div>
            <EvidenceTimeline items={timeline} />
          </div>

          <div className="card">
            <div className="card-head"><h2>Comparable sessions</h2><span className="small muted">What happened in similar shifts before</span></div>
            {a.comparables?.length ? (
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Date</th><th>Window</th><th className="r">Orders</th><th className="r">Acceptance</th><th className="r">Net</th><th className="r">Incentive</th><th>Similarity</th></tr></thead>
                <tbody>
                  <tr className="hl"><td><b>{dLong(cur.date)}</b></td><td>{cur.window}</td><td className="r num">{cur.orders}</td><td className="r num">{cur.acceptanceRate}%</td><td className="r num"><b>{inr(cur.net)}</b></td><td className="r num">{inr(cur.incentive)}</td><td className="tiny muted">under investigation</td></tr>
                  {a.comparables.map((c) => <tr key={c.sessionId}><td>{dLong(c.date)}</td><td>{c.window}</td><td className="r num">{c.orders}</td><td className="r num">{c.acceptanceRate}%</td><td className="r num">{inr(c.net)}</td><td className="r num">{inr(c.incentive)}</td><td className="tiny muted">{c.reasons.join(', ')}</td></tr>)}
                </tbody>
              </table></div>
            ) : <Empty title="No comparable sessions">Not enough similar history.</Empty>}
          </div>

          <div className="card">
            <div className="card-head"><h2>Evidence ({d.evidence.length})</h2></div>
            <div className="table-wrap"><table className="t"><thead><tr><th>Ref</th><th>Type</th><th>Date</th><th>Description</th><th>Source</th></tr></thead><tbody>
              {d.evidence.map((e, i) => (
                <tr key={e.id}><td className="mono">E{i + 1}</td><td><span className={`badge ${e.type === 'HINDSIGHT_MEMORY' ? 'b-memory' : 'b-gray'}`}>{titleCase(e.type)}</span></td><td className="small">{e.localDate ? dShort(e.localDate) : '—'}</td>
                  <td className="small"><b>{e.title}</b><details><summary className="dim" style={{ cursor: 'pointer', listStyle: 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.content?.detail}</summary><div className="dim" style={{ whiteSpace: 'pre-line' }}>{e.content?.detail}</div></details>{e.fileUrl ? <a href="#" onClick={async (ev) => { ev.preventDefault(); const r = await apiClient.get(`${scope.api}/investigations/${id}/evidence/${e.id}/file`, { responseType: 'blob' }); window.open(URL.createObjectURL(r.data)); }}>Open attachment</a> : null}</td>
                  <td className="tiny muted">{e.source}</td></tr>
              ))}
            </tbody></table></div>
            {d.status !== 'RESOLVED' && d.status !== 'CLOSED' ? (
              <form className="stack mt no-print" onSubmit={(e) => { e.preventDefault(); act('evidence', async () => { const form = new FormData(); if (statement) form.append('text', statement); if (file) form.append('file', file); await api.upload(`${scope.api}/investigations/${id}/evidence`, form); setStatement(''); setFile(null); return 'Evidence added.'; }); }}>
                <label className="field">Add your own evidence (statement, screenshot or PDF of a platform notice)<textarea className="textarea" style={{ minHeight: 60 }} value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={4000} placeholder="e.g. I did not receive any in-app notice about eligibility changes." /></label>
                <div className="row"><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} /><button className="btn sm" disabled={busy === 'evidence' || (!statement.trim() && !file)}>{busy === 'evidence' ? 'Adding…' : 'Add evidence'}</button></div>
              </form>
            ) : null}
          </div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <div className="card memory">
            <div className="card-head"><h2 style={{ color: 'var(--memory-ink)' }}>🧠 Memory · what the agent remembered</h2></div>
            {d.memoryContext?.notice ? <div className="alert warn small" style={{ marginBottom: 8 }}>{d.memoryContext.notice}</div> : null}
            {d.memoryContext?.recalls?.length ? <div className="tiny muted" style={{ marginBottom: 8 }}>{d.memoryContext.recalls.length} Hindsight recalls · {d.memoryContext.recalls.map((r) => `${r.count} results`).join(', ')}</div> : null}
            {memories.length ? <div className="stack" style={{ gap: 8 }}>{memories.map((m) => <MemoryItem key={m.memoryId} m={m} />)}</div> : <div className="small muted">No relevant memories were recalled when this case was opened.</div>}
          </div>

          <div className="card">
            <h2>Previous cases</h2>
            {d.previousCases.length ? d.previousCases.map((c) => (
              <div key={c.id} className="mt small"><Link to={`${scope.link}/investigations/${c.id}`}><b>{c.caseNumber}</b></Link> · {dLong(c.periodStart)}<div className="dim">{c.result}</div>{c.learning ? <div style={{ color: 'var(--memory-ink)', marginTop: 2 }}>Learning: {c.learning}</div> : null}</div>
            )) : <div className="small muted mt">No earlier resolved cases.</div>}
          </div>

          <div className="card">
            <h2>Questions to clarify</h2>
            <ul className="small" style={{ paddingLeft: 16, marginTop: 8 }}>{(a.recommendedQuestions || []).map((q) => <li key={q} style={{ marginBottom: 4 }}>{q}</li>)}</ul>
            {(a.recommendedActions || []).length ? <><div className="eyebrow mt">Recommended next steps</div><ol className="small" style={{ paddingLeft: 16, marginTop: 4 }}>{a.recommendedActions.map((x) => <li key={x.text} style={x.fromMemory ? { color: 'var(--memory-ink)', fontWeight: 650 } : undefined}>{x.text}</li>)}</ol></> : null}
          </div>

          <div className="card">
            <h2>Reports</h2>
            {d.reports.length ? d.reports.map((r) => <div key={r.id} className="row between mt small"><span>Version {r.version} · {timeAgo(r.generatedAt)}</span><Link className="btn sm" to={`${scope.link}/investigations/${id}/reports/${r.id}`}>Open</Link></div>) : <div className="small muted mt">No report yet. Use “Generate report”.</div>}
          </div>

          <div className="card">
            <h2>Outcome</h2>
            <div className="mt">
              {d.outcome ? (
                <div className="stack small">
                  <div><span className="badge b-good">{titleCase(d.outcome.rootCauseCategory)}</span></div>
                  <div>{d.outcome.result}</div>
                  <div className="dim"><b>Action:</b> {d.outcome.actionTaken}</div>
                  {d.outcome.learning ? <div style={{ color: 'var(--memory-ink)' }}><b>Learning:</b> {d.outcome.learning}</div> : null}
                  {d.outcome.memoryRetainedAt ? <div className="alert memory">🧠 Outcome retained in Hindsight ({timeAgo(d.outcome.memoryRetainedAt)}). Future investigations can recall it.</div>
                    : <div className="alert warn row between">Outcome not yet retained in memory.<button className="btn sm" onClick={() => act('retain', async () => { const r = await api.post(`${scope.api}/investigations/${id}/retain-outcome`, {}); return `Retain status: ${r.status}`; })}>{busy === 'retain' ? 'Retrying…' : 'Retry'}</button></div>}
                </div>
              ) : <OutcomeForm inv={d} onDone={() => { inv.reload(); reloadWorker(); }} />}
            </div>
          </div>

          <div className="card">
            <h2>Audit trail</h2>
            <div className="stack mt" style={{ gap: 6 }}>
              {d.auditTrail.map((x) => <div key={x.id} className="small"><b>{titleCase(x.action)}</b> <span className="tiny muted">{new Date(x.createdAt).toLocaleString()}</span>{x.details?.memoryRecalled ? <div className="tiny muted">memory recalled: {x.details.memoryRecalled.length}</div> : null}</div>)}
              {d.memoryEvents.map((x) => <div key={x.id} className="small"><span className={`badge ${x.operation === 'RECALL' ? 'b-memory' : 'b-brand'}`}>{x.operation}</span> {x.category || ''} <span className="tiny muted">{x.status.toLowerCase()} · {new Date(x.createdAt).toLocaleTimeString()}</span></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestigationWorkspacePage;
