import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import { useAsync, Loading, ErrorBox, Empty } from '../components/ui';
import { dLong } from '../lib/format';

const KIND = {
  profile: { icon: '👤', color: 'var(--brand)', label: 'Profile' },
  learned: { icon: '🧠', color: 'var(--memory)', label: 'Retained' },
  platform: { icon: '📣', color: 'var(--warn)', label: 'Retained' },
  anomaly: { icon: '◆', color: 'var(--critical)', label: 'Detected' },
  investigation: { icon: '📂', color: 'var(--series-1)', label: 'Investigation' },
  outcome: { icon: '✓', color: 'var(--good)', label: 'Outcome' },
  recall: { icon: '↺', color: 'var(--memory)', label: 'Recalled' }
};

const LOOP = ['Event', 'Retain', 'Time passes', 'New event', 'Recall', 'Better decision', 'Outcome', 'Retain outcome'];

const MemoryJourneyPage = () => {
  const scope = useScope();
  const { profile } = useWorker();
  const j = useAsync(() => api.get(`${scope.api}/memory/journey`), [scope.api, profile?.asOfDate]);
  if (j.loading && !j.data) return <Loading label="Loading memory journey…" memory />;
  if (j.error) return <ErrorBox error={j.error} onRetry={j.reload} />;
  const { milestones } = j.data;
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow" style={{ color: 'var(--memory-ink)' }}>Memory journey</div><h1>How the agent’s understanding developed over time</h1>
          <p>Each milestone below is backed by a real record: a Hindsight retain/recall in the memory audit log, an anomaly, or an investigation. Day numbers count from the first recorded shift.</p></div>
        <Link className="btn memory" to={`${scope.link}/memory/inspector`}>Open Memory Inspector →</Link>
      </div>
      <div className="card memory" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>The memory loop</div>
        <div className="row" style={{ gap: 6 }}>
          {LOOP.map((s, i) => <span key={s} className="row" style={{ gap: 6 }}><span className={`badge ${['Retain', 'Recall', 'Retain outcome'].includes(s) ? 'b-memory' : 'b-gray'}`}>{s}</span>{i < LOOP.length - 1 ? <span className="muted">→</span> : null}</span>)}
        </div>
      </div>
      {!milestones.length ? <Empty title="The journey has not started">No history has been recorded yet.</Empty> : (
        <div className="card">
          <div className="tl" style={{ paddingLeft: 90 }}>
            {milestones.map((m, i) => {
              const k = KIND[m.kind] || KIND.profile;
              return (
                <div key={i} className="tl-item fade" style={{ animationDelay: `${i * 30}ms` }}>
                  <div style={{ position: 'absolute', left: -90, top: 0, width: 58, textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }} className="num">DAY {m.day}</div>
                    <div className="tiny muted">{dLong(m.date).slice(4)}</div>
                  </div>
                  <span className="tl-dot" style={{ background: k.color, width: 16, height: 16, left: -24 }} />
                  <div className="tl-card" style={{ cursor: 'default', ...(m.kind === 'recall' || m.kind === 'learned' ? { borderColor: 'var(--memory-border)', background: 'var(--memory-soft)' } : {}) }}>
                    <div className="row between">
                      <b>{k.icon} {m.title}</b>
                      <div className="row" style={{ gap: 6 }}>
                        {m.retained ? <span className="badge b-memory">retained in Hindsight</span> : null}
                        {m.kind === 'recall' ? <span className="badge b-memory">recalled from Hindsight</span> : null}
                        {m.investigationId ? <Link className="btn sm" to={`${scope.link}/investigations/${m.investigationId}`}>Open</Link> : null}
                      </div>
                    </div>
                    <div className="small dim" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{m.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryJourneyPage;
