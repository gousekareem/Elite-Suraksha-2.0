import { dShort } from '../lib/format';
import { CategoryBadge } from './ui';

const ICON = { done: '✓', empty: '–', skipped: '–', unavailable: '!', failed: '!' };

/** Agent Memory Trace: every step the agent actually ran, including Hindsight recall. */
const MemoryTrace = ({ steps = [], compact = false }) => (
  <div className="trace" aria-label="Agent memory trace">
    {steps.map((s, i) => (
      <div key={`${s.id}-${i}`} className="trace-step fade" style={{ animationDelay: `${i * 40}ms` }}>
        <span className={`trace-ico ${s.status !== 'done' ? s.status : s.kind === 'memory' ? 'memory' : ''}`}>{s.kind === 'memory' && s.status === 'done' ? '🧠' : ICON[s.status] || '✓'}</span>
        <div>
          <div className="lbl" style={s.kind === 'memory' ? { color: 'var(--memory-ink)' } : undefined}>{s.label}{s.ms ? <span className="tiny muted"> · {s.ms} ms</span> : null}</div>
          <div className="det">{s.detail}</div>
          {!compact && s.memories?.length ? (
            <div className="stack" style={{ gap: 6, marginTop: 6 }}>
              {s.memories.map((m, j) => (
                <div key={m.id} className="mem" style={{ padding: '7px 10px' }}>
                  <div className="mem-meta"><b className="tiny">Memory {j + 1}</b><CategoryBadge category={m.category} />{m.localDate ? <span className="tiny muted">{dShort(m.localDate)}</span> : null}</div>
                  <p className="small" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.text}</p>
                </div>
              ))}
            </div>
          ) : null}
          {!compact && s.queries?.length ? <div className="tiny muted" style={{ marginTop: 4 }}>Hindsight queries: {s.queries.map((q) => `“${q.length > 70 ? `${q.slice(0, 70)}…` : q}”`).join(' · ')}</div> : null}
        </div>
      </div>
    ))}
  </div>
);

export default MemoryTrace;
