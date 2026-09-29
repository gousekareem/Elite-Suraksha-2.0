import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAsync, Loading, ErrorBox, SeverityBadge, CategoryBadge } from '../../components/ui';
import { dLong, STATUS, titleCase, timeAgo } from '../../lib/format';

const TABS = ['Workers', 'Anomalies', 'Cases', 'Memory activity', 'Audit'];

const AdminConsolePage = () => {
  const [tab, setTab] = useState('Workers');
  const data = useAsync(async () => {
    const [overview, workers, anomalies, investigations, memory, audit] = await Promise.all([
      api.get('/admin/overview'), api.get('/admin/workers'), api.get('/admin/anomalies'), api.get('/admin/investigations'), api.get('/admin/memory-activity'), api.get('/admin/audit')
    ]);
    return { overview, workers, anomalies, investigations, memory, audit };
  }, []);
  if (data.loading && !data.data) return <Loading label="Loading investigation console…" />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const d = data.data;
  const o = d.overview;
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Investigator</div><h1>Investigation console</h1><p>Cross-worker view for investigators. Open a worker to see their workspace exactly as they do; memory stays in that worker’s own bank.</p></div>
        <Link className="btn" to="/demo">Judge Demo →</Link></div>
      <div className="grid g4">
        <div className="card stat"><div className="eyebrow">Workers</div><div className="v num">{o.workers}</div></div>
        <div className="card stat"><div className="eyebrow">Significant anomalies</div><div className="v num">{o.significantAnomalies}</div></div>
        <div className="card stat"><div className="eyebrow">Cases</div><div className="v num">{Object.values(o.investigations).reduce((a, b) => a + b, 0)}</div><div className="s">{Object.entries(o.investigations).map(([k, v]) => `${v} ${titleCase(k).toLowerCase()}`).join(' · ') || 'none'}</div></div>
        <div className="card stat memory"><div className="eyebrow">Hindsight operations</div><div className="v num">{o.memory.retained + o.memory.recalls}</div><div className="s">{o.memory.retained} retains · {o.memory.recalls} recalls · {o.memory.failures} failures</div></div>
      </div>
      <div className="card mt">
        <div className="tabs">{TABS.map((t) => <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="table-wrap">
          {tab === 'Workers' ? <table className="t"><thead><tr><th>Worker</th><th>Platform</th><th>Zone</th><th className="r">Sessions</th><th className="r">Anomalies</th><th className="r">Cases</th><th /></tr></thead><tbody>
            {d.workers.map((w) => <tr key={w.id}><td><b>{w.fullName}</b>{w.isSynthetic ? <span className="badge b-gray" style={{ marginLeft: 6 }}>synthetic</span> : null}</td><td>{w.platformName}</td><td>{w.city} · {w.zone}</td><td className="r num">{w._count.sessions}</td><td className="r num">{w._count.anomalies}</td><td className="r num">{w._count.investigations}</td><td><Link className="btn sm" to={`/admin/workers/${w.id}/dashboard`}>Open workspace</Link></td></tr>)}
          </tbody></table> : null}
          {tab === 'Anomalies' ? <table className="t"><thead><tr><th>Date</th><th>Worker</th><th>State</th><th className="r">Deviation</th><th>Explanation</th><th>Case</th></tr></thead><tbody>
            {d.anomalies.map((a) => <tr key={a.id}><td>{dLong(a.localDate)}</td><td>{a.worker.fullName}</td><td><SeverityBadge severity={a.severity} /></td><td className="r num">{Number(a.deviationPct)}%</td><td className="small dim">{a.explanation}</td><td>{a.investigations[0] ? <Link to={`/admin/workers/${a.worker.id}/investigations/${a.investigations[0].id}`}>{a.investigations[0].caseNumber}</Link> : '—'}</td></tr>)}
          </tbody></table> : null}
          {tab === 'Cases' ? <table className="t"><thead><tr><th>Case</th><th>Worker</th><th>Status</th><th>Shift</th><th>Outcome</th><th /></tr></thead><tbody>
            {d.investigations.map((i) => <tr key={i.id}><td><b>{i.caseNumber}</b><div className="tiny muted">{i.title}</div></td><td>{i.worker.fullName}</td><td><span className={`badge ${STATUS[i.status]}`}>{titleCase(i.status)}</span></td><td>{dLong(i.periodStart)}</td><td className="small">{i.outcome ? titleCase(i.outcome.rootCauseCategory) : '—'}</td><td><Link className="btn sm" to={`/admin/workers/${i.worker.id}/investigations/${i.id}`}>Open</Link></td></tr>)}
          </tbody></table> : null}
          {tab === 'Memory activity' ? <table className="t"><thead><tr><th>When</th><th>Worker</th><th>Operation</th><th>Status</th><th>Category</th><th>Why</th></tr></thead><tbody>
            {d.memory.map((m) => <tr key={m.id}><td className="tiny">{timeAgo(m.createdAt)}</td><td>{m.worker.fullName}</td><td><span className={`badge ${m.operation === 'RECALL' ? 'b-memory' : 'b-brand'}`}>{m.operation}</span></td><td className="small">{m.status.toLowerCase()}</td><td>{m.category && !m.category.includes(',') ? <CategoryBadge category={m.category} /> : <span className="tiny muted">{m.category ? 'case categories' : 'all'}</span>}</td><td className="small dim">{m.reason}{m.query ? <div className="tiny">“{m.query.slice(0, 80)}”</div> : null}</td></tr>)}
          </tbody></table> : null}
          {tab === 'Audit' ? <table className="t"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
            {d.audit.map((a) => <tr key={a.id}><td className="tiny">{new Date(a.createdAt).toLocaleString()}</td><td>{titleCase(a.action)}</td><td className="small">{a.entityType}</td><td className="tiny mono dim" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{JSON.stringify(a.details)}</td></tr>)}
          </tbody></table> : null}
        </div>
      </div>
    </div>
  );
};

export default AdminConsolePage;
