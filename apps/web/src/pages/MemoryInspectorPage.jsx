import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useScope } from '../lib/scope';
import { useAsync, Loading, ErrorBox, Empty, CategoryBadge } from '../components/ui';
import MemoryItem from '../components/MemoryItem';
import { timeAgo, CATEGORY_LABEL, dShort } from '../lib/format';

const STATUS_CLS = { OK: 'b-good', EMPTY: 'b-gray', DUPLICATE_SKIPPED: 'b-gray', UNAVAILABLE: 'b-critical', FAILED: 'b-critical', DISABLED: 'b-gray' };

const MemoryInspectorPage = () => {
  const scope = useScope();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');
  const [showObs, setShowObs] = useState(false);
  const [msg, setMsg] = useState('');
  const [pref, setPref] = useState('');
  const [busy, setBusy] = useState('');
  const data = useAsync(() => api.get(`${scope.api}/memory/inspector`, query ? { q: query } : {}), [scope.api, query]);

  const act = async (key, fn) => {
    setBusy(key); setMsg('');
    try { setMsg(await fn()); data.reload(); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(''); }
  };

  if (data.loading && !data.data) return <Loading label="Reading memories from Hindsight…" memory />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const d = data.data;
  const obsCount = d.items.filter((m) => m.type === 'observation').length;
  const items = d.items.filter((m) => (!cat || m.category === cat) && (showObs || m.type !== 'observation'));

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow" style={{ color: 'var(--memory-ink)' }}>Memory inspector</div><h1>What the agent remembers — read live from Hindsight</h1>
          <p>Memories are listed straight from this worker’s Hindsight bank. The reasons come from the application’s audit log of each retain and recall.</p></div>
      </div>
      {d.notice ? <div className="alert warn" style={{ marginBottom: 12 }}>{d.notice}</div> : null}
      <div className="grid g4">
        <div className="card"><div className="eyebrow">Memory bank</div><div className="mono" style={{ marginTop: 6, wordBreak: 'break-all' }}>{d.bankId}</div><div className="tiny muted">one private bank per worker · id derived server-side</div></div>
        <div className="card"><div className="eyebrow">Hindsight</div><div style={{ marginTop: 6 }}>{d.hindsight.connected ? <span className="badge b-memory">Connected · API {d.hindsight.version}</span> : <span className="badge b-critical">Unavailable</span>}</div><div className="tiny muted">{d.hindsight.endpoint}</div></div>
        <div className="card"><div className="eyebrow">Memory units in bank</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.total}</div><div className="tiny muted">facts + consolidated observations</div></div>
        <div className="card"><div className="eyebrow">Operations logged</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.events.length}</div><div className="tiny muted">retain / recall (latest 100)</div></div>
      </div>

      <div className="grid g3 mt" style={{ alignItems: 'start' }}>
        <div className="card span2">
          <div className="card-head">
            <h2>Memories</h2>
            <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
              <input className="input" style={{ width: 200 }} placeholder="Text search in Hindsight" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="select" style={{ width: 190 }} value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">All categories</option>
                {Object.keys(CATEGORY_LABEL).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={showObs} onChange={(e) => setShowObs(e.target.checked)} />Show {obsCount} consolidated observations</label>
            </form>
          </div>
          {items.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {items.map((m) => (
                <MemoryItem key={m.id} m={m}>
                  <div className="row tiny muted" style={{ marginTop: 6, gap: 12 }}>
                    <span>id <span className="mono">{m.id.slice(0, 8)}</span></span>
                    {m.documentId ? <span>document <span className="mono">{m.documentId.length > 36 ? `${m.documentId.slice(0, 36)}…` : m.documentId}</span></span> : null}
                    <span>{m.recalledTimes ? `recalled ${m.recalledTimes}×` : 'not recalled yet'}</span>
                    {m.investigationId ? <Link to={`${scope.link}/investigations/${m.investigationId}`}>used in investigation →</Link> : null}
                  </div>
                </MemoryItem>
              ))}
            </div>
          ) : <Empty title={d.status === 'EMPTY' ? 'No memory bank yet' : 'No memories match'}>Memories appear after history is loaded and the agent learns patterns.</Empty>}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Teach the agent</h2>
            <p className="small dim" style={{ margin: '4px 0 8px' }}>A stated preference is retained as a <i>worker_preference</i> memory.</p>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); act('pref', async () => { const r = await api.post(`${scope.api}/memory/preferences`, { preference: pref }); setPref(''); return `Retain status: ${r.status}`; }); }}>
              <input className="input" placeholder="e.g. Show amounts per hour as well" value={pref} onChange={(e) => setPref(e.target.value)} maxLength={300} />
              <button className="btn memory sm" disabled={!pref.trim() || busy}>{busy === 'pref' ? 'Saving to memory…' : 'Retain preference'}</button>
            </form>
            <button className="btn sm mt" disabled={!!busy} onClick={() => act('learn', async () => { const r = await api.post(`${scope.api}/memory/learn`, {}); return r.reason ? `Nothing learned: ${r.reason}` : `Patterns processed: ${r.retained.map((x) => x.status).join(', ')}`; })}>{busy === 'learn' ? 'Learning patterns…' : 'Re-learn patterns from history'}</button>
            {msg ? <div className="alert info small mt">{msg}</div> : null}
          </div>
          <div className="card">
            <h2>Memory activity</h2>
            <div className="stack mt" style={{ gap: 0 }}>
              {d.events.slice(0, 40).map((e) => (
                <details key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                    <div className="row" style={{ gap: 6 }}><span className={`badge ${e.operation === 'RECALL' ? 'b-memory' : 'b-brand'}`}>{e.operation}</span><span className={`badge ${STATUS_CLS[e.status]}`}>{e.status.replace('_', ' ').toLowerCase()}</span>{e.category && !e.category.includes(',') ? <CategoryBadge category={e.category} /> : null}<span className="tiny muted">{timeAgo(e.createdAt)}{e.localDate ? ` · story date ${dShort(e.localDate)}` : ''}</span></div>
                    <div className="small" style={{ marginTop: 3 }}>{e.operation === 'RECALL' ? `“${e.query?.slice(0, 90)}${e.query?.length > 90 ? '…' : ''}” → ${e.resultCount ?? 0} results` : e.preview?.slice(0, 110)}</div>
                  </summary>
                  <div className="small dim" style={{ marginTop: 6 }}><b>{e.operation === 'RETAIN' ? 'Retained because' : 'Recalled because'}:</b> {e.reason}</div>
                  {e.results?.length ? <ul className="small" style={{ paddingLeft: 16, marginTop: 4 }}>{e.results.map((r) => <li key={r.id}>{r.text}</li>)}</ul> : null}
                  {e.latencyMs ? <div className="tiny muted">{e.latencyMs} ms</div> : null}
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryInspectorPage;
