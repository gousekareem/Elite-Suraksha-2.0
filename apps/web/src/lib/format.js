const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const inr = (v, dp = 0) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${n < 0 ? '−' : ''}₹${s}`;
};
export const pct = (v, dp = 0) => (v === null || v === undefined ? '—' : `${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(dp)}%`);
const parse = (s) => new Date(`${s}T00:00:00Z`);
export const dShort = (s) => (s ? `${parse(s).getUTCDate()} ${MONTHS[parse(s).getUTCMonth()]}` : '—');
export const dLong = (s) => (s ? `${DAYS[parse(s).getUTCDay()]} ${parse(s).getUTCDate()} ${MONTHS[parse(s).getUTCMonth()]} ${parse(s).getUTCFullYear()}` : '—');
export const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
export const titleCase = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const timeAgo = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export const SEVERITY = {
  NORMAL: { label: 'Normal', cls: 'b-good', icon: '✓' },
  WATCH: { label: 'Watch', cls: 'b-warn', icon: '!' },
  SIGNIFICANT_CHANGE: { label: 'Significant change', cls: 'b-serious', icon: '▲' },
  INVESTIGATION_RECOMMENDED: { label: 'Investigation recommended', cls: 'b-critical', icon: '◆' }
};
export const STATUS = {
  OPEN: 'b-gray', IN_PROGRESS: 'b-brand', AWAITING_CLARIFICATION: 'b-warn', RESOLVED: 'b-good', CLOSED: 'b-gray'
};
export const CATEGORY_LABEL = {
  worker_pattern: 'Work pattern', worker_preference: 'Preference', earnings_pattern: 'Earnings pattern',
  historical_anomaly: 'Past anomaly', investigation_finding: 'Investigation finding', investigation_outcome: 'Investigation outcome',
  platform_context: 'Platform context', user_feedback: 'Worker feedback', observation: 'Consolidated observation'
};
