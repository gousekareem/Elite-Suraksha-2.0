import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useScope } from '../lib/scope';
import { useWorker } from '../components/Layout';
import { useAsync, Loading, ErrorBox, Stat, SeverityBadge, Empty } from '../components/ui';
import EarningsChart from '../components/charts/EarningsChart';
import { inr, pct, dLong, dShort, STATUS, titleCase } from '../lib/format';

const DashboardPage = () => {
  const scope = useScope();
  const navigate = useNavigate();
  const { profile } = useWorker();
  const dash = useAsync(() => api.get(`${scope.api}/dashboard`), [scope.api, profile?.asOfDate]);
  const series = useAsync(() => api.get(`${scope.api}/earnings/series`, { days: 120 }), [scope.api, profile?.asOfDate]);

  if (dash.loading && !dash.data) return <Loading label="Loading earnings intelligence…" />;
  if (dash.error) return <ErrorBox error={dash.error} onRetry={dash.reload} />;
  const d = dash.data;
  const s = d.summary;
  const la = s.latestAnalysis;
  const latest = s.latestSession;
  const segPoints = (series.data?.points || []).filter((p) => latest && p.segmentKey === latest.segmentKey);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Earnings intelligence</div>
          <h1>Hello {d.worker.fullName.split(' ')[0]} — here is what your history says</h1>
          <p>Every figure below is computed from your own records. The agent remembers your patterns and past cases in Hindsight, so it can explain changes against <i>your</i> normal, not an average.</p>
        </div>
        <Link to={`${scope.link}/ask`} className="btn primary lg">Ask about my earnings →</Link>
      </div>

      {!s.hasData ? (
        <Empty title="No earnings history yet" action={profile?.isSynthetic ? <Link className="btn primary" to="/demo">Open the Judge Demo</Link> : null}>
          {profile?.isSynthetic ? 'Load the synthetic history from the Judge Demo to begin.' : 'Import your platform statements through the API (POST /me/earnings/import) to start building your personal baseline.'}
        </Empty>
      ) : (
        <>
          <div className="grid g5">
            <Stat label={s.today ? `Today · ${dShort(s.asOf)}` : 'Latest shift'} value={inr(s.today ? s.today.net : latest?.net)} sub={s.today ? `${s.today.orders} orders · ${s.today.sessions} session` : latest ? `${dLong(latest.date)} · ${latest.orders} orders` : ''} />
            <Stat label="Last 7 days" value={inr(s.week.current.net)} sub={<span>{s.week.current.sessions} sessions · <span className={s.week.netChangePct < 0 ? 'delta-neg' : 'delta-pos'}>{pct(s.week.netChangePct, 1)}</span> vs prior week</span>} />
            <Stat label="Last 30 days" value={inr(s.month.current.net)} sub={<span>{inr(s.month.current.perHour)}/hour · <span className={s.month.netChangePct < 0 ? 'delta-neg' : 'delta-pos'}>{pct(s.month.netChangePct, 1)}</span> vs prior 30 days</span>} />
            <Stat label="Personal baseline" value={la?.baseline?.sampleSize >= 3 ? inr(la.baseline.net.median) : '—'} sub={la?.baseline ? `${la.baseline.label} · ${la.baseline.sampleSize} sessions` : ''} />
            <Stat label="Current deviation" value={la?.evaluation?.sufficientHistory ? pct(la.evaluation.deviationPct, 1) : '—'} tone={la?.evaluation?.deviationPct < -10 ? 'delta-neg' : ''} sub={la?.evaluation ? <SeverityBadge severity={la.evaluation.severity} /> : null} />
          </div>

          <div className="grid g3 mt">
            <div className="card span2">
              <div className="card-head">
                <div><h2>{latest ? `${latest.dayName} ${latest.window} shifts` : 'Earnings'}</h2><div className="small muted">Net earnings vs your personal baseline · click a point to analyse it</div></div>
                <Link to={`${scope.link}/earnings`} className="btn sm">All earnings →</Link>
              </div>
              {series.loading ? <Loading /> : <EarningsChart points={segPoints} onSelect={(p) => navigate(`${scope.link}/earnings?session=${p.sessionId}`)} />}
            </div>
            <div className="card memory">
              <div className="card-head"><h2 style={{ color: 'var(--memory-ink)' }}>🧠 Agent memory</h2><Link to={`${scope.link}/memory`} className="btn sm">Journey →</Link></div>
              <div className="grid g2">
                <div><div className="eyebrow">Memories retained</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.memory.retained}</div></div>
                <div><div className="eyebrow">Recalls</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.memory.recalled}</div></div>
                <div><div className="eyebrow">Learned patterns</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.memory.learnedPatterns}</div></div>
                <div><div className="eyebrow">Investigations</div><div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{d.memory.investigations}</div></div>
              </div>
              <p className="small dim mt">Counts come from the audit log of real Hindsight retain/recall calls made for {d.worker.fullName.split(' ')[0]}’s private memory bank.</p>
            </div>
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-head"><h2>Needs attention</h2><span className="small muted">Anomaly engine · internal states, not legal conclusions</span></div>
              {d.attention.length ? (
                <div className="stack" style={{ gap: 0 }}>
                  {d.attention.map((a) => (
                    <div key={a.id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--grid)', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row"><b>{dLong(a.date)}</b><SeverityBadge severity={a.severity} /><span className="num small delta-neg">{pct(a.deviationPct, 1)}</span></div>
                        <div className="small dim" style={{ marginTop: 2 }}>{a.explanation}</div>
                      </div>
                      {a.investigations[0]
                        ? <Link className="btn sm" to={`${scope.link}/investigations/${a.investigations[0].id}`}>{a.investigations[0].caseNumber}</Link>
                        : ['INVESTIGATION_RECOMMENDED', 'SIGNIFICANT_CHANGE'].includes(a.severity) ? <Link className="btn sm" to={`${scope.link}/ask?q=${encodeURIComponent(`Why did my earnings drop on ${dShort(a.date)}?`)}`}>Ask why</Link> : null}
                    </div>
                  ))}
                </div>
              ) : <Empty title="Nothing unusual">Your recent sessions are within your normal range.</Empty>}
            </div>
            <div className="card">
              <div className="card-head"><h2>Investigations</h2><Link to={`${scope.link}/investigations`} className="btn sm">Open →</Link></div>
              <div className="grid g3">
                {['OPEN', 'IN_PROGRESS', 'RESOLVED'].map((k) => (
                  <div key={k}><span className={`badge ${STATUS[k]}`}>{titleCase(k)}</span><div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{d.investigations[k] || 0}</div></div>
                ))}
              </div>
              <div className="mt">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Where the money came from · last 30 days</div>
                {[['Base pay', s.breakdown30.basePay, 'var(--series-1)'], ['Incentives', s.breakdown30.incentive, 'var(--series-2)'], ['Tips', s.breakdown30.tips, 'var(--series-3)'], ['Deductions', -s.breakdown30.deductions, 'var(--text-3)']].map(([l, v, c]) => {
                  const total = s.breakdown30.basePay + s.breakdown30.incentive + s.breakdown30.tips;
                  return (
                    <div key={l} className="row" style={{ gap: 10, marginBottom: 6 }}>
                      <span className="small" style={{ width: 84 }}>{l}</span>
                      <div style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 4 }}><div style={{ width: `${Math.min(100, (Math.abs(v) / (total || 1)) * 100)}%`, height: '100%', background: c, borderRadius: 4 }} /></div>
                      <span className="num small" style={{ width: 80, textAlign: 'right' }}>{inr(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
