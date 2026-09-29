import { Link } from 'react-router-dom';
import MemoryItem from './MemoryItem';
import EvidenceTimeline from './EvidenceTimeline';
import { inr, dLong } from '../lib/format';
import { useScope } from '../lib/scope';

const Section = ({ kind, title, items, render }) => (items?.length ? (
  <div className="mt">
    <div className="row" style={{ gap: 8, marginBottom: 4 }}><span className={`badge b-${kind}`}>{title}</span><span className="tiny muted">{items.length}</span></div>
    {items.map((f, i) => <div key={i} className="finding" style={{ gridTemplateColumns: '1fr' }}>{render(f)}</div>)}
  </div>
) : null);

/**
 * Structured agent answer: summary, FACT / INFERENCE / UNKNOWN, recalled memory,
 * comparable sessions, recommended actions and the investigation offer.
 */
const AgentAnswer = ({ answer, onOffer, offerBusy, compact = false }) => {
  const scope = useScope();
  if (!answer) return null;
  const recalledOutcome = answer.historicalContext?.some((h) => h.category === 'investigation_outcome');
  return (
    <div className="fade">
      {answer.memory?.notice ? <div className="alert warn" style={{ marginBottom: 10 }}>{answer.memory.notice}</div> : null}
      {recalledOutcome && answer.usedPreviousOutcome ? (
        <div className="alert memory" style={{ marginBottom: 10 }}><b>🧠 I found a similar situation in your previous history.</b> A previous investigation outcome was recalled from Hindsight and changed what I recommend checking first.</div>
      ) : null}
      <p style={{ fontSize: 15, lineHeight: 1.6 }}>{answer.summary}</p>

      {answer.offer ? (
        <div className="row mt">
          {answer.offer.type === 'CREATE_INVESTIGATION'
            ? <button className="btn primary" onClick={() => onOffer?.(answer.offer)} disabled={offerBusy}>{offerBusy ? <><span className="spinner" /> Building investigation…</> : 'Create investigation →'}</button>
            : <Link className="btn primary" to={`${scope.link}/investigations/${answer.offer.investigationId}`}>{answer.offer.label} →</Link>}
        </div>
      ) : null}

      <Section kind="fact" title="FACT" items={answer.facts} render={(f) => <span>{f.text}</span>} />
      <Section kind="infer" title="INFERENCE" items={answer.inferences} render={(f) => (
        <div>
          <span>{f.text}</span>
          <div className="tiny muted" style={{ marginTop: 2 }}>{f.confidence ? `Confidence: ${f.confidence.toLowerCase()}` : ''}{f.basis ? ` · Basis: ${f.basis}` : ''}</div>
        </div>
      )} />
      <Section kind="unknown" title="UNKNOWN" items={answer.unknowns} render={(f) => <span className="dim">{f.text}</span>} />

      {answer.recommendedActions?.length ? (
        <div className="mt">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Recommended next steps</div>
          <ol className="stack" style={{ gap: 6, paddingLeft: 18 }}>
            {answer.recommendedActions.map((a, i) => <li key={i} style={a.fromMemory ? { color: 'var(--memory-ink)', fontWeight: 650 } : undefined}>{a.text}{a.fromMemory ? ' (from memory)' : ''}</li>)}
          </ol>
        </div>
      ) : null}
      {answer.recommendedQuestions?.length ? (
        <div className="mt">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Questions to raise with the platform</div>
          <ul className="stack" style={{ gap: 4, paddingLeft: 18 }}>{answer.recommendedQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      ) : null}

      {!compact && answer.historicalContext?.length ? (
        <div className="mt2">
          <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--memory-ink)' }}>Historical context · recalled from Hindsight</div>
          <div className="stack" style={{ gap: 8 }}>{answer.historicalContext.map((h) => <MemoryItem key={h.memoryId || h.text} m={h} />)}</div>
        </div>
      ) : null}

      {!compact && answer.comparableSessions?.length ? (
        <div className="mt2">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Comparable shifts</div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Date</th><th>Window</th><th className="r">Orders</th><th className="r">Net</th><th className="r">Incentive</th><th className="r">Δ vs this shift</th></tr></thead>
            <tbody>
              {answer.metrics?.current ? <tr className="hl"><td><b>{dLong(answer.metrics.current.date)}</b></td><td>{answer.metrics.current.window}</td><td className="r num">{answer.metrics.current.orders}</td><td className="r num"><b>{inr(answer.metrics.current.net)}</b></td><td className="r num">{inr(answer.metrics.current.incentive)}</td><td className="r muted">this shift</td></tr> : null}
              {answer.comparableSessions.map((c) => <tr key={c.sessionId}><td>{dLong(c.date)}</td><td>{c.window}</td><td className="r num">{c.orders}</td><td className="r num">{inr(c.net)}</td><td className="r num">{inr(c.incentive)}</td><td className="r num">{inr(-c.netDiffVsCurrent)}</td></tr>)}
            </tbody>
          </table></div>
        </div>
      ) : null}

      {!compact && answer.timeline?.length && answer.prefersTimeline ? (
        <div className="mt2">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Evidence timeline <span className="badge b-memory" style={{ marginLeft: 6 }}>shown because you prefer chronological timelines (memory)</span></div>
          <EvidenceTimeline items={answer.timeline} />
        </div>
      ) : null}

      {!compact && answer.evidence?.length ? (
        <details className="mt2">
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 650 }}>Evidence used ({answer.evidence.length})</summary>
          <div className="stack mt" style={{ gap: 6 }}>
            {answer.evidence.map((e) => <div key={e.id} className="small"><span className={`badge ${e.type === 'HINDSIGHT_MEMORY' ? 'b-memory' : 'b-gray'}`}>{e.type.replace(/_/g, ' ').toLowerCase()}</span> <b>{e.label}</b> — <span className="dim">{e.detail}</span></div>)}
          </div>
        </details>
      ) : null}
    </div>
  );
};

export default AgentAnswer;
