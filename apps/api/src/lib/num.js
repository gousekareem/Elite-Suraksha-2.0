// Deterministic numeric helpers. The LLM never does arithmetic; this module does.

const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));
const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((toNum(v) + Number.EPSILON) * f) / f;
};
const sum = (arr) => arr.reduce((a, b) => a + toNum(b), 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].map(toNum).sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].map(toNum).sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const pctChange = (observed, baseline) => {
  const b = toNum(baseline);
  if (!b) return null;
  return round(((toNum(observed) - b) / Math.abs(b)) * 100, 1);
};
const inr = (v, { decimals = 0 } = {}) => {
  const n = round(v, decimals);
  const sign = n < 0 ? '−' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};
const pct = (v, dp = 0) => `${round(Math.abs(v), dp)}%`;

// Seeded PRNG (mulberry32) so the synthetic dataset is reproducible.
const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

module.exports = { toNum, round, sum, mean, median, quantile, pctChange, inr, pct, seededRandom };
