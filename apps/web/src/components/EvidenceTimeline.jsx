import { useState } from 'react';
import { dLong } from '../lib/format';

const COLOR = { comparable: 'var(--series-1)', platform_event: 'var(--warn)', current: 'var(--critical)', memory: 'var(--memory)', statement: 'var(--brand)' };
const KIND = { comparable: 'Comparable shift', platform_event: 'Platform event', current: 'Session under review', memory: 'Recalled from memory', statement: 'Worker evidence' };

/** Chronological, expandable evidence timeline. */
const EvidenceTimeline = ({ items = [] }) => {
  const [open, setOpen] = useState(() => new Set(items.filter((i) => i.kind === 'current').map((i) => i.evidenceId)));
  if (!items.length) return <div className="empty"><b>No timeline yet</b></div>;
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="tl">
      {items.map((it, i) => {
        const id = it.evidenceId || `${it.kind}-${i}`;
        const expanded = open.has(id);
        return (
          <div key={id} className="tl-item">
            <span className="tl-dot" style={{ background: COLOR[it.kind] || 'var(--text-3)' }} />
            <div className="tl-date">{dLong(it.date).toUpperCase()}</div>
            <button type="button" className="tl-card" onClick={() => toggle(id)} aria-expanded={expanded} style={it.kind === 'memory' ? { borderColor: 'var(--memory-border)', background: 'var(--memory-soft)' } : it.kind === 'current' ? { borderColor: 'var(--critical)' } : undefined}>
              <div className="row between"><b className="small">{it.title}</b><span className="tiny muted">{KIND[it.kind] || it.kind} {expanded ? '▴' : '▾'}</span></div>
              {expanded ? <div className="small dim" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{it.detail}</div> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EvidenceTimeline;
