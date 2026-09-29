import { CategoryBadge } from './ui';
import { dLong } from '../lib/format';

/** One Hindsight memory, always shown in the memory (violet) language. */
const MemoryItem = ({ m, showWhy = true, children }) => (
  <div className="mem fade">
    <div className="mem-meta">
      <span aria-hidden>🧠</span>
      <CategoryBadge category={m.category} />
      {m.localDate ? <span className="tiny muted">{dLong(m.localDate)}</span> : null}
      {m.type === 'observation' || m.consolidated ? <span className="badge b-gray" title="Hindsight consolidated this into an observation">consolidated</span> : null}
      {m.linkedCase ? <span className="badge b-gray">{m.linkedCase.caseNumber}</span> : null}
    </div>
    <p>{m.text}</p>
    {showWhy && (m.whyRecalled || m.retainedBecause) ? <div className="why">{m.whyRecalled ? `Recalled because: ${m.whyRecalled}` : `Retained because: ${m.retainedBecause}`}</div> : null}
    {children}
  </div>
);

export default MemoryItem;
