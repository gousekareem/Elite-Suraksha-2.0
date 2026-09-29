import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useWorker, MemoryStatus } from '../components/Layout';
import { useAsync, Loading, ErrorBox, DemoDataBadge } from '../components/ui';
import { dLong } from '../lib/format';

const JudgeDemoPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reload: reloadWorker, system } = useWorker();
  const st = useAsync(() => api.get('/demo/state'), []);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  useEffect(() => { reloadWorker(); }, [st.data?.asOf]); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.loading && !st.data) return <Loading label="Loading demo state…" />;
  if (st.error) return <ErrorBox error={st.error} onRetry={st.reload} />;
  const s = st.data;
  const steps = s.steps || {};
  const base = user?.role === 'ADMIN' && s.workerId ? `/admin/workers/${s.workerId}` : '';
  const ask = (q) => navigate(`${base}/ask?q=${encodeURIComponent(q)}`);

  const run = async (key, path, label) => {
    setBusy(key); setError('');
    const t0 = Date.now();
    try {
      const r = await api.post(path, {});
      const retained = r.learned ? Object.entries(r.learned).map(([k, v]) => `${v} ${k}`).join(', ') : null;
      setLog((l) => [{ label, ms: Date.now() - t0, detail: [r.ingested ? `${r.ingested.created} sessions ingested, ${r.ingested.anomalies.length} anomalies flagged` : null, retained ? `patterns retained: ${retained}` : null, r.memory ? `outcome memory: ${r.memory.status}` : null].filter(Boolean).join(' · ') }, ...l]);
      await st.reload();
      reloadWorker();
      return r;
    } catch (e) { setError(errorMessage(e)); return null; } finally { setBusy(''); }
  };

  const fastForward = async () => {
    await run('reset', '/demo/reset', 'Reset');
    for (const [k, p, l] of [['h', '/demo/steps/load-history', 'Load history'], ['a', '/demo/steps/first-anomaly', 'First anomaly'], ['i', '/demo/steps/open-first-investigation', 'Open investigation'], ['o', '/demo/steps/resolve-first-investigation', 'Resolve + retain outcome'], ['t', '/demo/steps/time-jump', 'Time jump']]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await run(k, p, l);
      if (!r) break;
    }
  };

  const openSecond = async () => {
    setBusy('second'); setError('');
    try {
      const res = await api.post(`${base || '/me'}/investigations`, { date: s.story.secondAnomalyDate, question: 'Why did my earnings drop again on Friday 14 August?' });
      navigate(`${base}/investigations/${res.investigation.id}`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };

  const STEPS = [
    { n: 1, title: 'Reset the demo', say: 'Start clean: synthetic worker Rahul Kumar, an empty Hindsight memory bank.', done: false, action: () => run('reset', '/demo/reset', 'Reset'), btn: 'Reset demo', always: true },
    { n: 2, title: 'Establish memory — Phase 1 history', say: `“The agent has been observing this worker’s history.” Loads ${dLong(s.story.historyStart)} – ${dLong(s.story.phase1End)} and retains learned patterns in Hindsight.`, done: steps.history, action: () => run('history', '/demo/steps/load-history', 'Load history'), btn: 'Load history & learn patterns', links: [['Earnings', `${base}/earnings`], ['Memory Journey', `${base}/memory`]] },
    { n: 3, title: 'Ask a historical question', say: 'The answer uses worker-specific history and the learned memory.', done: null, go: () => ask('What do I normally earn on Friday evenings?'), btn: 'Ask: “What do I normally earn on Friday evenings?”', needs: steps.history },
    { n: 4, title: 'Create the first anomaly', say: `${dLong(s.story.firstAnomalyDate)}: similar workload, lower earnings. The anomaly engine flags it and retains it as memory.`, done: steps.firstAnomaly, action: () => run('anomaly', '/demo/steps/first-anomaly', 'First anomaly'), btn: 'Introduce first anomaly', needs: steps.history },
    { n: 5, title: 'Ask why earnings dropped', say: 'Baseline, comparable shifts, anomaly and Hindsight recall — shown in the Agent Memory Trace.', done: null, go: () => ask('Why did my earnings drop?'), btn: 'Ask: “Why did my earnings drop?”', needs: steps.firstAnomaly },
    { n: 6, title: 'Investigate', say: 'Open the investigation: evidence, timeline, findings and unknowns. (Or use “Create investigation” from the agent’s answer.)', done: steps.firstInvestigation, action: async () => { const r = await run('inv', '/demo/steps/open-first-investigation', 'Open investigation'); if (r) navigate(`${base}/investigations/${r.investigationId}`); }, btn: 'Open investigation for 19 Jun', needs: steps.firstAnomaly },
    { n: 7, title: 'Record the outcome → retain in Hindsight', say: `A synthetic platform clarification arrives on ${dLong(s.story.clarificationDate)}. The case is resolved and its outcome + learning are retained.`, done: steps.firstOutcomeRetained, action: () => run('outcome', '/demo/steps/resolve-first-investigation', 'Resolve + retain outcome'), btn: 'Resolve with platform clarification', needs: steps.firstInvestigation },
    { n: 8, title: 'Time jump', say: `Weeks pass. Normal work resumes, then on ${dLong(s.story.secondAnomalyDate)} a similar earnings problem appears.`, done: steps.timeJump, action: () => run('jump', '/demo/steps/time-jump', 'Time jump'), btn: `Jump to ${dLong(s.story.secondAnomalyDate)}`, needs: steps.firstOutcomeRetained },
    { n: 9, title: 'The WOW moment', say: '“I found a similar situation in your previous history.” The previous outcome is recalled and changes what to check first.', done: null, go: () => ask('Why did my earnings drop again?'), btn: 'Ask: “Why did my earnings drop again?”', needs: steps.timeJump, wow: true },
    { n: 10, title: 'Without memory vs with memory', say: 'Same question, three agents: current-only, structured history, and history + Hindsight.', done: null, go: () => navigate(`${base}/compare`), btn: 'Open comparison', needs: steps.timeJump },
    { n: 11, title: 'Generate the new investigation & report', say: 'The new case cites the recalled outcome as evidence. Generate the evidence-first report.', done: steps.secondInvestigation, action: openSecond, btn: 'Open investigation for 14 Aug', needs: steps.timeJump }
  ];

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Judge demo</div><h1>Three-minute memory demo</h1>
          <p>Every button runs the real application workflows — ingestion, anomaly engine, agent tools, investigations — and every memory step is a real Hindsight retain or recall. Nothing is pre-scripted in the UI.</p></div>
        <div className="row"><DemoDataBadge /><MemoryStatus system={system} /></div>
      </div>
      <ErrorBox error={error} />
      {system && !system.hindsight.connected ? <div className="alert warn" style={{ marginBottom: 12 }}>Hindsight is not reachable. The demo still runs on structured records, and memory steps will show as unavailable. Start Hindsight (see README) for the full story.</div> : null}
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="stack span2" style={{ gap: 10 }}>
          {STEPS.map((x) => {
            const locked = x.needs === false;
            return (
              <div key={x.n} className={`card${x.wow ? ' memory' : ''}`} style={{ opacity: locked ? 0.55 : 1, display: 'grid', gridTemplateColumns: '38px 1fr', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 800, background: x.done ? 'var(--good)' : x.wow ? 'var(--memory)' : 'var(--surface-2)', color: x.done || x.wow ? '#fff' : 'var(--text-2)' }}>{x.done ? '✓' : x.n}</div>
                <div>
                  <div className="row between"><b>{x.title}</b>{x.links ? <div className="row">{x.links.map(([l, to]) => <Link key={l} className="small" to={to}>{l} →</Link>)}</div> : null}</div>
                  <div className="small dim" style={{ margin: '3px 0 8px' }}>{x.say}</div>
                  <button className={`btn sm ${x.wow ? 'memory' : x.go ? '' : 'primary'}`} disabled={!!busy || locked || (x.done && !x.always && !x.go)} onClick={x.action || x.go}>{x.done && !x.always && !x.go ? 'Done' : x.btn}</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="stack" style={{ gap: 14, position: 'sticky', top: 70 }}>
          <div className="card">
            <h2>Scenario state</h2>
            <div className="stack small mt" style={{ gap: 6 }}>
              <div className="row between"><span className="muted">Worker</span><b>{s.workerName || '—'}</b></div>
              <div className="row between"><span className="muted">Demo clock</span><b>{s.asOf ? dLong(s.asOf) : '—'}</b></div>
              <div className="row between"><span className="muted">Sessions recorded</span><b className="num">{s.sessions ?? 0}</b></div>
              <div className="row between"><span className="muted">Anomalies flagged</span><b className="num">{s.anomalies?.length ?? 0}</b></div>
              <div className="row between"><span className="muted">Investigations</span><b className="num">{s.investigations?.length ?? 0}</b></div>
              <div className="row between"><span className="muted" style={{ color: 'var(--memory-ink)' }}>Hindsight retains (OK)</span><b className="num">{s.memory?.retained ?? 0}</b></div>
              <div className="row between"><span className="muted" style={{ color: 'var(--memory-ink)' }}>Hindsight recalls</span><b className="num">{s.memory?.recalls ?? 0}</b></div>
            </div>
            <button className="btn sm mt" disabled={!!busy} onClick={fastForward}>Fast-forward to step 9</button>
            {busy ? <div className="mt"><Loading label={busy === 'outcome' ? 'Saving outcome to memory…' : busy === 'history' ? 'Ingesting history and retaining learned patterns…' : 'Running workflow…'} memory /></div> : null}
          </div>
          <div className="card">
            <h2>Step log</h2>
            {log.length ? <div className="stack small mt" style={{ gap: 6 }}>{log.map((l, i) => <div key={i}><b>{l.label}</b> <span className="tiny muted">{l.ms} ms</span><div className="dim">{l.detail}</div></div>)}</div> : <div className="small muted mt">Actions you run appear here.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JudgeDemoPage;
