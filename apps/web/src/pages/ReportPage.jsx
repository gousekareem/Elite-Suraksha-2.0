import { Link, useParams } from 'react-router-dom';
import { api, apiClient, errorMessage } from '../api/client';
import { useScope } from '../lib/scope';
import { useAsync, Loading, ErrorBox } from '../components/ui';
import { timeAgo } from '../lib/format';

const ReportPage = () => {
  const { id, reportId } = useParams();
  const scope = useScope();
  const r = useAsync(() => api.get(`${scope.api}/investigations/${id}/reports/${reportId}`), [scope.api, id, reportId]);
  if (r.loading) return <Loading label="Loading report…" />;
  if (r.error) return <ErrorBox error={r.error} />;
  const rep = r.data;
  const c = rep.content;
  const download = async () => {
    try {
      const res = await apiClient.get(`${scope.api}/investigations/${id}/reports/${reportId}/markdown`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `${c.header.investigationId}-report-v${rep.version}.md`;
      a.click();
    } catch (e) { alert(errorMessage(e)); }
  };
  return (
    <div>
      <div className="row between no-print" style={{ marginBottom: 14 }}>
        <Link to={`${scope.link}/investigations/${id}`} className="small">← Back to {c.header.investigationId}</Link>
        <div className="row"><button className="btn" onClick={download}>Download Markdown</button><button className="btn primary" onClick={() => window.print()}>Print / Save as PDF</button></div>
      </div>
      <article className="card" style={{ padding: 'clamp(16px,4vw,36px)', maxWidth: 900 }}>
        <div className="eyebrow">EliteSuraksha 2.0 · version {rep.version} · generated {timeAgo(rep.generatedAt)}</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 12px' }}>{c.header.title}</h1>
        <div className="grid g2 small" style={{ gap: 6 }}>
          <div><b>Worker:</b> {c.header.worker}</div>
          <div><b>Investigation ID:</b> {c.header.investigationId}</div>
          <div><b>Investigation period:</b> {c.header.investigationPeriod}</div>
          <div><b>Status:</b> {c.header.status}</div>
          <div className="span2"><b>Prepared for:</b> {c.header.generatedFor}</div>
        </div>
        {c.header.synthetic ? <div className="alert info small mt">Demo data — synthetic worker and synthetic platform records.</div> : null}
        {c.sections.map((s) => (
          <section key={s.n} className="mt2">
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>{s.n}. {s.title}</h2>
            {s.body ? <ul style={{ paddingLeft: 18 }} className="stack">{s.body.map((b, i) => <li key={i} style={s.n === 7 ? { color: 'var(--memory-ink)' } : undefined}>{b}</li>)}</ul> : null}
            {s.table ? (s.table.rows.length ? (
              <div className="table-wrap"><table className="t"><thead><tr>{s.table.columns.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{s.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="small">{cell}</td>)}</tr>)}</tbody></table></div>
            ) : <div className="small muted">None.</div>) : null}
          </section>
        ))}
        <hr className="mt2" style={{ border: 0, borderTop: '1px solid var(--border)' }} />
        <div className="stack mt small muted">{c.disclaimer.map((d) => <i key={d}>{d}</i>)}</div>
      </article>
    </div>
  );
};

export default ReportPage;
