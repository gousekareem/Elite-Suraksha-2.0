import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import { useAsync, Loading, ErrorBox, Empty, SeverityBadge } from '../components/ui';
import { dLong, STATUS, titleCase, timeAgo } from '../lib/format';

const InvestigationsPage = () => {
  const scope = useScope();
  const { profile } = useWorker();
  const list = useAsync(() => api.get(`${scope.api}/investigations`), [scope.api, profile?.asOfDate]);
  if (list.loading && !list.data) return <Loading label="Loading investigations…" />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const rows = list.data;
  const resolved = rows.filter((r) => r.outcome);
  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Accountability</div><h1>Investigations, previous cases & reports</h1><p>Each investigation preserves the evidence, the recalled memory and the findings at the time it was opened. Resolved outcomes are retained in Hindsight for future cases.</p></div>
        <Link className="btn primary" to={`${scope.link}/ask`}>Start from a question →</Link>
      </div>
      {!rows.length ? <Empty title="No investigations yet">Ask the agent why your earnings changed; if a change needs follow-up, it will offer to open an investigation.</Empty> : (
        <div className="card"><div className="table-wrap"><table className="t">
          <thead><tr><th>Case</th><th>Shift</th><th>Status</th><th>Anomaly</th><th className="r">Evidence</th><th className="r">Reports</th><th>Outcome</th><th>Opened</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><Link to={`${scope.link}/investigations/${r.id}`}><b>{r.caseNumber}</b></Link><div className="tiny muted">{r.title}</div></td>
              <td>{dLong(r.periodStart)}</td>
              <td><span className={`badge ${STATUS[r.status]}`}>{titleCase(r.status)}</span></td>
              <td>{r.anomaly ? <SeverityBadge severity={r.anomaly.severity} /> : '—'}</td>
              <td className="r num">{r._count.evidence}</td>
              <td className="r num">{r._count.reports}</td>
              <td className="small">{r.outcome ? <>{titleCase(r.outcome.rootCauseCategory)} {r.outcome.memoryRetainedAt ? <span className="badge b-memory">in memory</span> : <span className="badge b-warn">not retained</span>}</> : <span className="muted">open</span>}</td>
              <td className="tiny muted">{timeAgo(r.createdAt)}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      {resolved.length ? (
        <div className="card mt">
          <h2>Previous cases — what we learned</h2>
          <div className="stack mt">{resolved.map((r) => (
            <div key={r.id} className="mem"><div className="mem-meta"><b>{r.caseNumber}</b><span className="tiny muted">{dLong(r.periodStart)}</span></div><p>{r.outcome.result}</p>{r.outcome.learning ? <div className="why">Learning: {r.outcome.learning}</div> : null}</div>
          ))}</div>
        </div>
      ) : null}
    </div>
  );
};

export default InvestigationsPage;
