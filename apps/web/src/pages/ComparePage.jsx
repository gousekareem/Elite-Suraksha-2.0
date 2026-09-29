import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useScope } from '../lib/scope';
import { ErrorBox, Loading } from '../components/ui';
import AgentAnswer from '../components/AgentAnswer';
import MemoryTrace from '../components/MemoryTrace';

const COLUMNS = [
  { key: 'currentOnly', title: 'Without memory', sub: 'Stateless: sees only the current shift', cls: 'b-gray' },
  { key: 'historyOnly', title: 'With persistent history', sub: 'Structured records + baseline · Hindsight recall off', cls: 'b-brand' },
  { key: 'full', title: 'With Hindsight memory', sub: 'History + recalled experiences and outcomes', cls: 'b-memory' }
];

const QUESTIONS = ['Why did my earnings drop?', 'Why did my earnings drop again?', 'What do I normally earn on Friday evenings?', 'Have I experienced this before?'];

const ComparePage = () => {
  const scope = useScope();
  const [question, setQuestion] = useState(QUESTIONS[1]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError('');
    try { setResult(await api.post(`${scope.api}/agent/compare`, { question })); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow" style={{ color: 'var(--memory-ink)' }}>Without memory vs with memory</div><h1>Same question, three levels of memory</h1>
          <p>All three columns run the same agent on the same records. The only difference is what it is allowed to remember. The third column is the only one that calls Hindsight.</p></div>
      </div>
      <div className="card">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select className="select" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question">{QUESTIONS.map((q) => <option key={q}>{q}</option>)}</select>
          <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Running 3 agents…' : 'Run comparison'}</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {busy ? <Loading label="Running the agent three times (current only → history → history + Hindsight)…" memory /> : null}
      {result ? (
        <div className="grid g3 mt" style={{ alignItems: 'start' }}>
          {COLUMNS.map((c) => {
            const r = result[c.key];
            const a = r.answer;
            return (
              <div key={c.key} className={`card${c.key === 'full' ? ' memory' : ''}`}>
                <span className={`badge ${c.cls}`}>{c.title}</span>
                <div className="tiny muted" style={{ margin: '4px 0 10px' }}>{c.sub}</div>
                <div className="row small" style={{ gap: 6, marginBottom: 10 }}>
                  <span className="badge b-fact">{a.facts.length} facts</span><span className="badge b-infer">{a.inferences.length} inferences</span><span className="badge b-unknown">{a.unknowns.length} unknowns</span><span className="badge b-memory">{a.historicalContext?.length || 0} memories</span>
                </div>
                <AgentAnswer answer={{ ...a, offer: null, evidence: [], comparableSessions: [], timeline: [] }} compact />
                {a.historicalContext?.length ? (
                  <div className="mt"><div className="eyebrow" style={{ color: 'var(--memory-ink)' }}>Recalled from Hindsight</div>
                    <ul className="small" style={{ paddingLeft: 16, marginTop: 4 }}>{a.historicalContext.map((h) => <li key={h.memoryId} style={{ marginBottom: 4 }}>{h.text.length > 170 ? `${h.text.slice(0, 170)}…` : h.text}</li>)}</ul></div>
                ) : null}
                <details className="mt"><summary className="small" style={{ cursor: 'pointer', fontWeight: 650 }}>Trace</summary><div className="mt"><MemoryTrace steps={r.trace} compact /></div></details>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default ComparePage;
