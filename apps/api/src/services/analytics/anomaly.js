// Explainable anomaly engine (pure, deterministic).
// Produces internal product states — NORMAL / WATCH / SIGNIFICANT_CHANGE /
// INVESTIGATION_RECOMMENDED — never legal conclusions.

const { round, pctChange, inr, pct } = require('../../lib/num');
const { decompose } = require('./metrics');

const MIN_BASELINE_SAMPLES = 3;
const THRESHOLDS = { watch: 10, significant: 15, investigate: 20 };

const within = (value, s, slack = 0) => value >= s.min - slack && value <= s.max + slack;

/**
 * Evaluate one session against its personal baseline.
 * Returns { severity, metric, deviationPct, signals[], explanation, decomposition, sufficientHistory }.
 */
const evaluateSession = (current, baseline) => {
  if (!baseline || baseline.sampleSize < MIN_BASELINE_SAMPLES) {
    return {
      severity: 'NORMAL',
      sufficientHistory: false,
      metric: 'net_earnings',
      baselineValue: baseline?.net?.median ?? 0,
      observedValue: current.net,
      deviationPct: 0,
      signals: [],
      decomposition: null,
      explanation: `Not enough comparable history yet (${baseline?.sampleSize || 0} sessions; at least ${MIN_BASELINE_SAMPLES} needed) to judge whether this session is unusual.`
    };
  }

  const dev = pctChange(current.net, baseline.net.median);
  const signals = [];
  const add = (key, label, observed, expected, status, detail) => signals.push({ key, label, observed, expected, status, detail });

  const ordersNormal = within(current.orders, baseline.orders, 1);
  add('order_volume', 'Order volume', current.orders, `${baseline.orders.min}–${baseline.orders.max}`,
    ordersNormal ? 'normal' : current.orders < baseline.orders.min ? 'low' : 'high',
    ordersNormal ? 'Completed orders are within the worker\'s normal range for this shift.'
      : `Completed orders are outside the normal range (${baseline.orders.min}–${baseline.orders.max}).`);

  const hoursNormal = within(current.activeHours, baseline.activeHours, 0.5);
  add('active_hours', 'Active hours', current.activeHours, `${baseline.activeHours.min}–${baseline.activeHours.max}`,
    hoursNormal ? 'normal' : 'changed', hoursNormal ? 'Active time is typical.' : 'Active time differs from the usual range.');

  const incentiveDelta = round(current.incentive - baseline.incentive.median, 2);
  const incentiveStatus = incentiveDelta <= -50 ? 'dropped' : incentiveDelta >= 50 ? 'increased' : 'normal';
  add('incentive', 'Incentive', current.incentive, baseline.incentive.median, incentiveStatus,
    incentiveStatus === 'dropped'
      ? `Incentive was ${inr(current.incentive)} vs a usual ${inr(baseline.incentive.median)}${current.incentiveNote ? ` (platform note: "${current.incentiveNote}")` : ''}.`
      : 'Incentive is in line with the usual amount.');

  const perOrderDev = pctChange(current.basePerOrder, baseline.basePerOrder.median);
  add('pay_per_order', 'Base pay per order', current.basePerOrder, baseline.basePerOrder.median,
    perOrderDev !== null && perOrderDev <= -8 ? 'dropped' : 'normal',
    `Base pay per order ${inr(current.basePerOrder, { decimals: 2 })} vs usual ${inr(baseline.basePerOrder.median, { decimals: 2 })}.`);

  const dedDelta = round(current.deductions - baseline.deductions.median, 2);
  add('deductions', 'Deductions', current.deductions, baseline.deductions.median, dedDelta >= 40 ? 'spike' : 'normal',
    dedDelta >= 40 ? `Deductions ${inr(dedDelta)} above usual.` : 'Deductions are in line with the usual amount.');

  const idleDelta = round(current.idleHours - baseline.idleHours.median, 2);
  add('idle_time', 'Idle time', current.idleHours, baseline.idleHours.median, idleDelta >= 0.75 ? 'increased' : 'normal',
    idleDelta >= 0.75 ? `Idle time ${idleDelta}h above usual.` : 'Idle time is typical.');

  const accDelta = round(current.acceptanceRate - baseline.acceptanceRate.median, 1);
  add('acceptance_rate', 'Acceptance rate', current.acceptanceRate, baseline.acceptanceRate.median,
    Math.abs(accDelta) >= 5 ? 'changed' : 'normal', `Acceptance ${current.acceptanceRate}% vs usual ${baseline.acceptanceRate.median}%.`);

  const cancelDelta = current.cancellations - baseline.cancellations.median;
  add('cancellations', 'Cancellations', current.cancellations, baseline.cancellations.median,
    cancelDelta >= 2 ? 'increased' : 'normal', cancelDelta >= 2 ? 'More cancellations than usual.' : 'Cancellations are typical.');

  if (current.rating !== null && baseline.sampleSize) {
    add('rating', 'Rating', current.rating, null, current.rating < 4.3 ? 'low' : 'normal', current.rating < 4.3 ? 'Rating is lower than usual.' : 'Rating is typical.');
  }

  const decomposition = decompose(current, baseline);
  const drop = dev !== null && dev < 0 ? Math.abs(dev) : 0;
  const explainedByVolume = !ordersNormal && current.orders < baseline.orders.min && decomposition.primaryFactor === 'order_volume';
  const explainedByHours = !hoursNormal && current.activeHours < baseline.activeHours.min;

  let severity = 'NORMAL';
  if (drop >= THRESHOLDS.investigate) {
    severity = explainedByVolume || explainedByHours ? 'SIGNIFICANT_CHANGE' : 'INVESTIGATION_RECOMMENDED';
  } else if (drop >= THRESHOLDS.significant) {
    severity = 'SIGNIFICANT_CHANGE';
  } else if (drop >= THRESHOLDS.watch) {
    severity = 'WATCH';
  }

  const primary = decomposition.parts.find((p) => p.key === decomposition.primaryFactor);
  const parts = [];
  if (dev === null || dev >= 0) {
    parts.push(`Net earnings ${inr(current.net)} are at or above the personal baseline (${inr(baseline.net.median)}).`);
  } else {
    parts.push(`Net earnings ${inr(current.net)} are ${pct(dev)} below the personal baseline of ${inr(baseline.net.median)} for ${baseline.label} (${baseline.sampleSize} sessions).`);
    parts.push(ordersNormal ? `Order volume (${current.orders}) is within the normal range.` : `Order volume (${current.orders}) is outside the normal range of ${baseline.orders.min}–${baseline.orders.max}.`);
    if (primary) parts.push(`Largest contributing component: ${primary.label.toLowerCase()} (${inr(primary.amount)} vs baseline average).`);
    if (explainedByVolume) parts.push('The decline is consistent with lower order volume.');
  }

  return {
    severity,
    sufficientHistory: true,
    metric: 'net_earnings',
    baselineValue: baseline.net.median,
    observedValue: current.net,
    deviationPct: dev ?? 0,
    signals,
    decomposition,
    explainedBy: explainedByVolume ? 'order_volume' : explainedByHours ? 'active_hours' : null,
    explanation: parts.join(' ')
  };
};

const SEVERITY_RANK = { NORMAL: 0, WATCH: 1, SIGNIFICANT_CHANGE: 2, INVESTIGATION_RECOMMENDED: 3 };

module.exports = { evaluateSession, THRESHOLDS, MIN_BASELINE_SAMPLES, SEVERITY_RANK };
