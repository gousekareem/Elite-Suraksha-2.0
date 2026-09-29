// Deterministic synthetic dataset for the EliteSuraksha 2.0 judge demo.
//
// Everything here is SYNTHETIC: a fictional worker, a generic platform and
// invented platform notices. Nothing describes a real company or real policy.
//
// Story (all dates local, Asia/Kolkata):
//   Phase 1  27 Apr – 18 Jun  Normal pattern. Fri/Sat evening shifts earn ~₹950–1,100
//                             with a ₹250 "Evening Peak Bonus".
//   Event    15 Jun           Synthetic notice: bonus eligibility terms updated (no details).
//   Phase 2  19 Jun (Fri)     Same workload, bonus not paid → first anomaly.
//   Phase 4  24 Jun           Synthetic platform clarification: acceptance-rate threshold
//                             moved 80% → 90%; worker's rate was 86%.
//   Normal   26 Jun – 13 Aug  Worker keeps acceptance ≥ 90%, bonus resumes.
//   Event    17 Jul (Fri)     Synthetic app outage → fewer orders (explained dip).
//   Event    10 Aug           Synthetic notice: bonus zone map revised (no details).
//   Phase 5  14 Aug (Fri)     Acceptance 93%, 25 orders, 9 in Zone B → bonus not paid again.

const dates = require('../lib/dates');
const { seededRandom, round } = require('../lib/num');

const DEMO = {
  phone: '9000000001',
  adminPhone: '9000000009',
  secondWorkerPhone: '9000000002',
  worker: {
    fullName: 'Rahul Kumar',
    city: 'Hyderabad',
    zone: 'Zone A',
    platformCode: 'GENERIC_DELIVERY',
    platformName: 'Generic Delivery Platform (synthetic)',
    preferences: {
      explanationStyle: 'chronological evidence timeline',
      language: 'English',
      note: 'Set by the worker during onboarding (synthetic).'
    }
  },
  secondWorker: {
    fullName: 'Asha Reddy',
    city: 'Hyderabad',
    zone: 'Zone C',
    platformCode: 'GENERIC_DELIVERY',
    platformName: 'Generic Delivery Platform (synthetic)',
    preferences: { explanationStyle: 'short summary' }
  },
  historyStart: '2026-04-27',
  phase1End: '2026-06-18',
  firstAnomalyDate: '2026-06-19',
  clarificationDate: '2026-06-24',
  outageDate: '2026-07-17',
  secondAnomalyDate: '2026-08-14'
};

const PEAK_BONUS = 'Evening Peak Bonus';
const STREAK_BONUS = 'Weeknight Streak Bonus';

// Weekly schedule: dayOfWeek → shift template
const SCHEDULE = {
  0: { start: 12, end: 16, orders: [14, 16], program: null },
  3: { start: 19, end: 23, orders: [16, 18], program: STREAK_BONUS },
  4: { start: 19, end: 23, orders: [16, 18], program: STREAK_BONUS },
  5: { start: 18, end: 23, orders: [22, 27], program: PEAK_BONUS },
  6: { start: 18, end: 23, orders: [23, 28], program: PEAK_BONUS }
};

// Days the worker did not work (deterministic "life happens" gaps).
const SKIP = new Set(['2026-05-10', '2026-05-27', '2026-06-20', '2026-07-08', '2026-07-26', '2026-08-06']);

// Fixed overrides for the story-critical sessions so the headline numbers are stable.
const OVERRIDES = {
  '2026-06-19': { orders: 24, offered: 28, accepted: 24, zoneB: 0, tips: 20, peakEligible: false,
    note: 'Not eligible under current programme terms' },
  '2026-07-17': { orders: 15, offered: 17, accepted: 15, zoneB: 0, tips: 10, peakEligible: false,
    note: 'Minimum 20 completed orders not met', outage: true },
  '2026-08-14': { orders: 25, offered: 27, accepted: 25, zoneB: 9, tips: 25, peakEligible: false,
    note: 'Not eligible' }
};

const PLATFORM_EVENTS = [
  {
    ref: 'evt-2026-06-15-peak-terms',
    date: '2026-06-15',
    hour: 10,
    type: 'INCENTIVE_TERMS_CHANGE',
    title: 'Evening Peak Bonus eligibility terms updated',
    description: 'In-app notice (synthetic): "Eligibility criteria for the Evening Peak Bonus have been updated. Please review programme terms in the app." The notice does not state which criteria changed.'
  },
  {
    ref: 'evt-2026-07-17-outage',
    date: '2026-07-17',
    hour: 19,
    type: 'APP_OUTAGE',
    title: 'Order dispatch disruption (19:00–20:30)',
    description: 'Status notice (synthetic): order dispatch was degraded in Hyderabad between 19:00 and 20:30.'
  },
  {
    ref: 'evt-2026-08-10-zone-map',
    date: '2026-08-10',
    hour: 9,
    type: 'ZONE_CHANGE',
    title: 'Peak bonus zone map revised for Hyderabad',
    description: 'In-app notice (synthetic): "Peak bonus zone boundaries have been revised for Hyderabad. Check the app for updated zones." The notice does not say whether deliveries outside the worker\'s home zone count toward eligibility.'
  }
];

// The synthetic platform clarification used when the demo resolves case #1.
const FIRST_CASE_OUTCOME = {
  result: 'Platform support clarified that, from 15 Jun 2026, the Evening Peak Bonus requires an acceptance rate of at least 90% (previously 80%). The worker\'s acceptance rate on 19 Jun was 85.7%, so the bonus was not paid. No retroactive adjustment was made.',
  rootCauseCategory: 'INCENTIVE_ELIGIBILITY_CHANGE',
  actionTaken: 'Worker requested the eligibility record through in-app support and received the clarification. Worker now keeps acceptance rate at or above 90% on peak-bonus shifts.',
  resolutionSource: 'Synthetic platform support response',
  workerFeedback: 'The timeline made it easy to show support exactly which shift and which bonus was affected.',
  learning: 'When net earnings fall while completed order volume stays within the normal range, check incentive eligibility conditions (and recent incentive-terms notices) before attributing the decline to lower demand.'
};

const acceptanceFor = (date, rand) => {
  if (date < '2026-06-15') return 0.82 + rand() * 0.07; // 82–89%
  if (date < '2026-06-25') return 0.84 + rand() * 0.04; // 84–88% (unaware of change)
  return 0.905 + rand() * 0.05; // 90.5–95.5% after clarification
};

const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const buildStatement = (date, rand) => {
  const dow = dates.dayOfWeek(date);
  const tpl = SCHEDULE[dow];
  if (!tpl || SKIP.has(date)) return null;
  const ov = OVERRIDES[date] || {};

  const completed = ov.orders ?? (tpl.orders[0] + Math.floor(rand() * (tpl.orders[1] - tpl.orders[0] + 1)));
  const accRate = ov.accepted ? ov.accepted / ov.offered : acceptanceFor(date, rand);
  const accepted = ov.accepted ?? completed;
  const offered = ov.offered ?? Math.max(accepted, Math.round(accepted / accRate));
  const zoneBCount = ov.zoneB ?? 0;

  const startMin = tpl.start * 60;
  const windowMin = (tpl.end - tpl.start) * 60;
  const trips = [];
  for (let i = 0; i < completed; i += 1) {
    const km = round(2 + rand() * 2.6, 1);
    const pay = Math.round(20 + 3.5 * km);
    const t = startMin + Math.floor(((i + 0.5 + rand() * 0.4) / completed) * (windowMin - 10));
    trips.push({ time: clock(t), zone: i >= completed - zoneBCount ? 'Zone B' : 'Zone A', km, pay, status: 'COMPLETED' });
  }
  // A cancelled order roughly every other session (not paid).
  if (rand() < 0.45) {
    trips.push({ time: clock(startMin + Math.floor(rand() * windowMin)), zone: 'Zone A', km: 0, pay: 0, status: 'CANCELLED' });
  }

  const tips = ov.tips ?? (Math.floor(rand() * 5) * 10);
  const activeMinutes = Math.min(windowMin - 12, Math.round(completed * (10.2 + rand() * 1.2)));

  let incentive = null;
  if (tpl.program === PEAK_BONUS) {
    const threshold = date >= '2026-06-15' ? 0.9 : 0.8;
    let eligible = completed >= 20 && accepted / offered >= threshold;
    if (ov.peakEligible === false) eligible = false;
    incentive = {
      program: PEAK_BONUS,
      eligible,
      amount: eligible ? 250 : 0,
      note: eligible ? 'Eligible' : (ov.note || 'Not eligible')
    };
  } else if (tpl.program === STREAK_BONUS) {
    const eligible = completed >= 15;
    incentive = { program: STREAK_BONUS, eligible, amount: eligible ? 80 : 0, note: eligible ? 'Eligible' : 'Minimum 15 orders not met' };
  }

  return {
    ref: `stmt-${date}`,
    date,
    start: clock(startMin),
    end: clock(tpl.end * 60),
    zone: 'Zone A',
    offered,
    accepted,
    activeMinutes,
    rating: round(4.6 + rand() * 0.3, 2),
    tips,
    trips,
    incentive,
    deductions: [{ label: 'Platform service fee', amount: 15 }]
  };
};

/** Statements for every worked day in [from, to] inclusive. Deterministic. */
const statementsBetween = (from, to) => {
  const out = [];
  for (let d = DEMO.historyStart; d <= to; d = dates.addDays(d, 1)) {
    // Seed per date so any sub-range yields identical rows.
    const rand = seededRandom(Number(d.replace(/-/g, '')) * 7919);
    const stmt = buildStatement(d, rand);
    if (stmt && d >= from) out.push(stmt);
  }
  return out;
};

const platformEventsBetween = (from, to) => PLATFORM_EVENTS.filter((e) => e.date >= from && e.date <= to);

// A small, clearly different history for the second synthetic worker (isolation tests/demo).
const secondWorkerStatements = () => {
  const out = [];
  for (let d = '2026-07-01'; d <= '2026-08-14'; d = dates.addDays(d, 1)) {
    const dow = dates.dayOfWeek(d);
    if (dow !== 1 && dow !== 2) continue; // Mon/Tue lunch shifts
    const rand = seededRandom(Number(d.replace(/-/g, '')) * 104729);
    const n = 11 + Math.floor(rand() * 2);
    const trips = Array.from({ length: n }, (_, i) => {
      const km = round(1.5 + rand() * 2, 1);
      return { time: clock(11 * 60 + i * 20), zone: 'Zone C', km, pay: Math.round(22 + 3 * km), status: 'COMPLETED' };
    });
    out.push({ ref: `stmt-${d}`, date: d, start: '11:00', end: '15:00', zone: 'Zone C', offered: n + 1, accepted: n,
      activeMinutes: n * 12, rating: 4.8, tips: 0, trips,
      incentive: { program: 'Lunch Rush Bonus', eligible: true, amount: 60, note: 'Eligible' },
      deductions: [{ label: 'Platform service fee', amount: 15 }] });
  }
  return out;
};

module.exports = {
  DEMO,
  PEAK_BONUS,
  STREAK_BONUS,
  PLATFORM_EVENTS,
  FIRST_CASE_OUTCOME,
  statementsBetween,
  platformEventsBetween,
  secondWorkerStatements
};
