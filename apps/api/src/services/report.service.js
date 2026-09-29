// Evidence-first investigation / grievance report generator.
// Deterministic: built from the stored investigation, evidence and findings.
// It summarises observed data; it does not establish legal liability.

const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const dates = require('../lib/dates');
const { inr } = require('../lib/num');
const { getInvestigation } = require('./investigation.service');
const { audit } = require('./audit.service');

const DISCLAIMER = [
  'This report summarises observed data and historical context recorded by EliteSuraksha.',
  'It does not independently establish legal liability or a breach of any platform policy.',
  'Applicable legal or platform-policy requirements should be verified against authoritative sources.',
  'All worker, platform and event data in the demo scenario are synthetic.'
];

const buildReport = (worker, inv, requestedAction) => {
  const a = inv.analysis || {};
  const cur = a.current || {};
  const base = a.baseline || {};
  const facts = inv.findings.filter((f) => f.kind === 'FACT');
  const inferences = inv.findings.filter((f) => f.kind === 'INFERENCE');
  const unknowns = inv.findings.filter((f) => f.kind === 'UNKNOWN');
  const evidenceIndex = Object.fromEntries(inv.evidence.map((e, i) => [e.id, `E${i + 1}`]));
  const cite = (ids) => (ids && ids.length ? ` [${ids.map((id) => evidenceIndex[id]).filter(Boolean).join(', ')}]` : '');
  const memories = (inv.memoryContext?.memories || []);

  return {
    header: {
      title: 'Earnings Investigation Report',
      worker: `${worker.fullName} (${worker.platformName}, ${worker.city} · ${worker.zone})`,
      investigationId: inv.caseNumber,
      investigationPeriod: inv.periodStart === inv.periodEnd ? dates.pretty(inv.periodStart) : `${dates.pretty(inv.periodStart)} – ${dates.pretty(inv.periodEnd)}`,
      status: inv.status,
      generatedFor: 'Worker review · support escalation · platform clarification',
      synthetic: Boolean(worker.isSynthetic)
    },
    sections: [
      { n: 1, title: 'Issue Reported', body: [inv.question] },
      { n: 2, title: 'Observed Change', body: [
        `${dates.pretty(cur.date)} · ${cur.dayName} ${cur.window} · ${cur.zone}: net ${inr(cur.net)} from ${cur.orders} completed orders (base ${inr(cur.basePay)}, incentive ${inr(cur.incentive)}, tips ${inr(cur.tips)}, deductions ${inr(cur.deductions)}).`,
        a.evaluation ? `Deviation from personal baseline: ${a.evaluation.deviationPct}%. Anomaly engine state: ${String(a.evaluation.severity).replace(/_/g, ' ')} (internal product state, not a legal conclusion).` : null
      ].filter(Boolean) },
      { n: 3, title: 'Historical Baseline', body: [
        base.sampleSize ? `${base.label}: median ${inr(base.net.median)}, range ${inr(base.net.min)}–${inr(base.net.max)}, ${base.orders.min}–${base.orders.max} orders, across ${base.sampleSize} sessions (${dates.short(base.windowStart)} – ${dates.short(base.windowEnd)}).` : 'Insufficient history for a baseline.'
      ] },
      { n: 4, title: 'Comparable Historical Sessions', table: {
        columns: ['Date', 'Window', 'Orders', 'Net', 'Incentive', 'Similarity'],
        rows: (a.comparables || []).map((c) => [dates.pretty(c.date), c.window, String(c.orders), inr(c.net), inr(c.incentive), String(c.similarity)])
      } },
      { n: 5, title: 'Evidence', body: facts.map((f) => `${f.statement}${cite(f.evidenceIds)}`) },
      { n: 6, title: 'Potential Contributing Factors', body: inferences.length ? inferences.map((f) => `${f.statement} (confidence: ${f.confidence || 'n/a'})${cite(f.evidenceIds)}`) : ['No contributing factor could be inferred from the available data.'] },
      { n: 7, title: 'Historical Context', body: memories.length
        ? memories.map((m) => `${m.localDate ? `${dates.short(m.localDate)} · ` : ''}${m.text} — recalled from persistent memory (${(m.category || 'memory').replace(/_/g, ' ')})`)
        : [inv.memoryContext?.notice || 'No relevant historical memory was recalled.'] },
      { n: 8, title: 'Previous Investigation Outcomes', body: inv.previousCases.length
        ? inv.previousCases.map((c) => `${c.caseNumber} (${dates.pretty(c.periodStart)}): ${c.result}${c.learning ? ` Learning: ${c.learning}` : ''}`)
        : ['No previous resolved investigations.'] },
      { n: 9, title: 'What Is Known', body: facts.map((f) => f.statement) },
      { n: 10, title: 'What Is Unknown', body: unknowns.length ? unknowns.map((u) => u.statement) : ['No open unknowns were identified.'] },
      { n: 11, title: 'Questions Requiring Clarification', body: a.recommendedQuestions && a.recommendedQuestions.length ? a.recommendedQuestions : ['None identified.'] },
      { n: 12, title: 'Requested Review / Action', body: [requestedAction] },
      { n: 13, title: 'Supporting Evidence', table: {
        columns: ['Ref', 'Type', 'Date', 'Description', 'Source'],
        rows: inv.evidence.map((e, i) => [`E${i + 1}`, e.type.replace(/_/g, ' '), e.localDate ? dates.short(e.localDate) : '—', e.title, e.source])
      } }
    ],
    disclaimer: DISCLAIMER
  };
};

const toMarkdown = (r) => {
  const out = [`# ${r.header.title}`, ''];
  out.push(`**Worker:** ${r.header.worker}  `);
  out.push(`**Investigation ID:** ${r.header.investigationId}  `);
  out.push(`**Investigation period:** ${r.header.investigationPeriod}  `);
  out.push(`**Status:** ${r.header.status}  `);
  if (r.header.synthetic) out.push('**Data:** Synthetic demo worker and synthetic platform records  ');
  out.push('');
  for (const s of r.sections) {
    out.push(`## ${s.n}. ${s.title}`, '');
    if (s.body) s.body.forEach((b) => out.push(`- ${b}`));
    if (s.table) {
      if (!s.table.rows.length) out.push('_None._');
      else {
        out.push(`| ${s.table.columns.join(' | ')} |`, `| ${s.table.columns.map(() => '---').join(' | ')} |`);
        s.table.rows.forEach((row) => out.push(`| ${row.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`));
      }
    }
    out.push('');
  }
  out.push('---', '', ...r.disclaimer.map((d) => `_${d}_`));
  return out.join('\n');
};

const generateReport = async (worker, investigationId, { requestedAction = null, actorUserId = null } = {}) => {
  const inv = await getInvestigation(worker, investigationId);
  const action = requestedAction || `Please review the ${inv.analysis?.current?.incentiveProgram || 'earnings'} record for ${dates.pretty(inv.periodStart)} and confirm which eligibility or pay condition applied, so the worker can understand the change.`;
  const content = buildReport(worker, inv, action);
  const markdown = toMarkdown(content);
  const last = await prisma.grievanceReport.findFirst({ where: { investigationId }, orderBy: { version: 'desc' } });
  const report = await prisma.grievanceReport.create({
    data: { investigationId, version: (last?.version || 0) + 1, status: 'DRAFT', requestedAction: action, content, markdown }
  });
  await audit({ actorUserId, workerId: worker.id, action: 'REPORT_GENERATED', entityType: 'Investigation', entityId: investigationId, details: { reportId: report.id, version: report.version } });
  return report;
};

const getReport = async (worker, investigationId, reportId) => {
  const report = await prisma.grievanceReport.findFirst({ where: { id: reportId, investigationId, investigation: { workerId: worker.id } } });
  if (!report) throw new AppError('Report not found', 404);
  return report;
};

module.exports = { generateReport, getReport, buildReport, toMarkdown, DISCLAIMER };
