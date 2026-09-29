import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import AgentAnswer from '../components/AgentAnswer';
import MemoryTrace from '../components/MemoryTrace';
import { ErrorBox } from '../components/ui';
import { dShort } from '../lib/format';

const PHASES = ['Identifying the relevant shift…', 'Loading current earnings…', 'Calculating your personal baseline…', 'Finding comparable shifts…', 'Recalling historical memory from Hindsight…', 'Analysing evidence…'];

const BASE_SUGGESTIONS = [
  'What do I normally earn on Friday evenings?',
  'Why did my earnings drop?',
  'Have I experienced this before?',
  'What happened last time?',
  'Show me comparable Friday shifts.',
  'Which factor contributed most to the decrease?',
  'What evidence supports this?',
  'What did we learn from my previous case?',
  'Create an investigation.'
];

const AskPage = () => {
  const scope = useScope();
  const navigate = useNavigate();
  const { profile } = useWorker();
  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(BASE_SUGGESTIONS);
  const endRef = useRef(null);
  const autoAsked = useRef(false);

  useEffect(() => {
    api.get(`${scope.api}/anomalies`).then((rows) => {
      const top = rows.find((a) => ['INVESTIGATION_RECOMMENDED', 'SIGNIFICANT_CHANGE'].includes(a.severity));
      if (top) setSuggestions([`Why did my earnings drop on ${dShort(top.localDate)}?`, ...BASE_SUGGESTIONS]);
    }).catch(() => {});
  }, [scope.api, profile?.asOfDate]);

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text || busy) return;
    setQuestion('');
    setError('');
    setBusy(true);
    setPhase(0);
    const timer = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 650);
    try {
      const res = await api.post(`${scope.api}/agent/ask`, { question: text });
      setThread((t) => [...t, res]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      clearInterval(timer);
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  useEffect(() => {
    const q = params.get('q');
    if (q && !autoAsked.current) {
      autoAsked.current = true; setParams({}, { replace: true }); ask(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOffer = async (offer) => {
    setOfferBusy(true);
    try {
      const res = await api.post(`${scope.api}/investigations`, { sessionId: offer.sessionId, ...(offer.anomalyId ? { anomalyId: offer.anomalyId } : {}) });
      navigate(`${scope.link}/investigations/${res.investigation.id}`);
    } catch (err) { setError(errorMessage(err)); } finally { setOfferBusy(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ask the agent</div>
          <h1>Ask about your earnings</h1>
          <p>The agent uses tools to read your records, recalls your history from Hindsight, and separates what is <b>known</b> from what is <b>inferred</b> and what is <b>unknown</b>.</p>
        </div>
      </div>

      {thread.map((r, i) => (
        <div key={r.interactionId} ref={i === thread.length - 1 ? endRef : null} className="grid g3 mt" style={{ alignItems: 'start', scrollMarginTop: 80 }}>
          <div className="card span2">
            <div className="chat-bubble" style={{ marginBottom: 14 }}>{r.question}</div>
            <AgentAnswer answer={r.answer} onOffer={onOffer} offerBusy={offerBusy} />
          </div>
          <div className="card" style={{ position: 'sticky', top: 70 }}>
            <div className="card-head"><h2>Agent Memory Trace</h2><span className="badge b-gray">{r.engine.engine === 'llm' ? r.engine.model : 'deterministic'}</span></div>
            <MemoryTrace steps={r.trace} />
            <div className="tiny muted mt">Tools called: {r.toolsUsed.map((t) => t.tool).join(', ') || 'none'}</div>
          </div>
        </div>
      ))}

      {busy ? (
        <div className="card mt row" style={{ gap: 12 }} aria-live="polite">
          <span className={`spinner${phase === 4 ? ' memory' : ''}`} />
          <b style={phase === 4 ? { color: 'var(--memory-ink)' } : undefined}>{PHASES[phase]}</b>
        </div>
      ) : null}
      <ErrorBox error={error} />

      <div className="card mt" style={{ position: thread.length ? 'static' : 'sticky', bottom: 12, zIndex: 5, boxShadow: 'var(--shadow-lg)' }}>
        <form className="row" onSubmit={(e) => { e.preventDefault(); ask(); }} style={{ flexWrap: 'nowrap' }}>
          <input className="input" aria-label="Your question" placeholder="e.g. Why did my earnings drop this Friday?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          <button className="btn primary" disabled={busy || !question.trim()}>Ask</button>
        </form>
        <div className="chips mt">
          {suggestions.slice(0, thread.length ? 3 : 9).map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
        </div>
      </div>
    </div>
  );
};

export default AskPage;
