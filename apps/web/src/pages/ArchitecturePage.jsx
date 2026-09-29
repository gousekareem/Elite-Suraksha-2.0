const Box = ({ title, sub, tone = 'plain', style }) => (
  <div style={{ border: `1.5px solid ${tone === 'memory' ? 'var(--memory)' : tone === 'brand' ? 'var(--brand)' : 'var(--border-strong)'}`, background: tone === 'memory' ? 'var(--memory-soft)' : tone === 'brand' ? 'var(--brand-soft)' : 'var(--surface)', borderRadius: 12, padding: '10px 14px', textAlign: 'center', ...style }}>
    <b style={{ color: tone === 'memory' ? 'var(--memory-ink)' : 'var(--text)' }}>{title}</b>
    {sub ? <div className="tiny dim">{sub}</div> : null}
  </div>
);
const Down = () => <div style={{ textAlign: 'center', color: 'var(--text-3)', lineHeight: 1 }}>↓</div>;

const TOOLS = ['get_worker_profile', 'get_recent_earnings', 'get_earnings_baseline', 'get_comparable_sessions', 'get_incentive_history', 'get_deduction_history', 'get_platform_events', 'get_previous_investigations', 'recall_hindsight_memory', 'retain_hindsight_memory', 'create_investigation', 'get_investigation_evidence', 'generate_evidence_summary', 'generate_grievance_report', 'record_investigation_outcome (worker-confirmed only)'];

const ArchitecturePage = () => (
  <div>
    <div className="page-head"><div><div className="eyebrow">How it works</div><h1>Architecture: structured facts + persistent agent memory</h1>
      <p>PostgreSQL is the source of truth for facts. Hindsight is the agent’s memory of experiences. The agent orchestrator combines both through a controlled tool registry; the numbers are always computed by code.</p></div></div>
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>System</h2>
        <div className="stack mt" style={{ gap: 6, maxWidth: 520, margin: '12px auto 0' }}>
          <Box title="Worker" sub="web app · mobile companion" />
          <Down />
          <Box title="React web app" sub="Dashboard · Ask · Memory · Investigations · Judge Demo" />
          <Down />
          <Box title="Express API" sub="JWT auth · worker scoping · validation · rate limits" />
          <Down />
          <Box title="Agent Orchestrator" sub="intent → ToolRegistry → reasoning → validated answer + memory trace" tone="brand" />
          <div className="grid g2" style={{ gap: 10 }}>
            <div className="stack" style={{ gap: 6 }}><Down /><Box title="PostgreSQL (Prisma)" sub="sessions · trips · earnings · events · anomalies · investigations · outcomes · audit" /></div>
            <div className="stack" style={{ gap: 6 }}><Down /><Box title="🧠 Hindsight" sub="one bank per worker · retain · recall · consolidation" tone="memory" style={{ borderWidth: 2.5 }} /></div>
          </div>
          <div className="stack" style={{ gap: 6, marginLeft: '50%', paddingLeft: 5 }}>
            <Down /><Box title="Historical context" tone="memory" /><Down /><Box title="Better investigation" /><Down /><Box title="Outcome" /><Down /><Box title="Hindsight RETAIN" tone="memory" />
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="card">
          <h2>PostgreSQL vs Hindsight</h2>
          <div className="table-wrap mt"><table className="t"><thead><tr><th>PostgreSQL — facts</th><th style={{ color: 'var(--memory-ink)' }}>Hindsight — experience</th></tr></thead><tbody>
            {[['Work sessions, trips, earnings', 'Learned work & earnings patterns'], ['Incentives, deductions, platform events', 'Platform context worth remembering'], ['Anomalies (all states)', 'Significant anomalies only'], ['Investigations, evidence, findings', 'What each investigation established'], ['Outcomes (structured)', 'Outcome + learning, recalled in future cases'], ['Audit log of every memory operation', 'Worker preferences & feedback']].map(([a, b]) => <tr key={a}><td>{a}</td><td style={{ color: 'var(--memory-ink)' }}>{b}</td></tr>)}
          </tbody></table></div>
        </div>
        <div className="card">
          <h2>Memory lifecycle</h2>
          <ol className="small stack mt" style={{ paddingLeft: 18, gap: 4 }}>
            {['Event (session ingested)', 'Retain (pattern / anomaly / platform notice)', 'Time passes', 'New event', 'Recall (question + similar-case recall, worker bank only)', 'Historical context ranked & filtered', 'Better decision (what to check first)', 'Investigation', 'Outcome confirmed by the worker', 'Retain outcome + learning', 'Future recall'].map((x) => <li key={x}>{x}</li>)}
          </ol>
        </div>
        <div className="card">
          <h2>Agent tools</h2>
          <div className="chips mt">{TOOLS.map((t) => <span key={t} className={`badge ${t.includes('hindsight') ? 'b-memory' : 'b-gray'} mono`}>{t}</span>)}</div>
          <p className="small dim mt">Every tool validates input and is scoped to the authenticated worker server-side. The LLM (when configured) only gets read-only tools; its figures are checked against tool output before display.</p>
        </div>
      </div>
    </div>
  </div>
);

export default ArchitecturePage;
