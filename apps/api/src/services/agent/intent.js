// Deterministic intent + parameter extraction for the agent planner.

const dates = require('../../lib/dates');

const DAY_WORDS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const INTENTS = [
  ['CREATE_INVESTIGATION', /\b(create|open|start|raise|file)\b.*\binvestigation|\binvestigate (this|it)\b/i],
  ['HISTORY', /(experienced this before|happen(ed)? before|last time|previous (case|investigation)|what did we learn|learn(ed)? from|similar (case|situation) before|before\?)/i],
  ['COMPARABLE', /\b(comparable|compare|similar (shifts?|sessions?))\b/i],
  ['FACTOR', /(which|what) factor|contributed (the )?most|biggest (reason|factor)|what changed/i],
  ['NORMAL_EARNINGS', /\b(normally|usually|typical(ly)?|on average|normal pattern)\b/i],
  ['EVIDENCE', /\bevidence\b|\bsupports?\b.*\bthis\b|\bprove\b/i],
  ['INCENTIVES', /\b(incentive|bonus)(es)? (history|record|trend)|\bmy (incentives|bonuses)\b/i],
  ['DEDUCTIONS', /\bdeduction/i],
  ['EARNINGS_DROP', /\b(why|drop(ped)?|fell|fall|down|lower|less|decrease[d]?|decline[d]?|low)\b/i]
];

const detectIntent = (q) => {
  for (const [name, re] of INTENTS) if (re.test(q)) return name;
  return 'GENERAL';
};

/** Extract a target date / weekday / time window from the question, relative to asOf. */
const extractTarget = (q, asOf) => {
  const text = q.toLowerCase();
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso && dates.isDateString(iso[1])) return { date: iso[1] };
  const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(text)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/.exec(text);
  if (dm) {
    const [day, mon] = /^\d/.test(dm[1]) ? [dm[1], dm[2]] : [dm[2], dm[1]];
    const d = `${asOf.slice(0, 4)}-${String(MONTHS[mon.slice(0, 3)]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dates.isDateString(d)) return { date: d };
  }
  if (/\btoday\b/.test(text)) return { date: asOf };
  if (/\byesterday\b/.test(text)) return { date: dates.addDays(asOf, -1) };
  let dayOfWeek = null;
  for (const [w, n] of Object.entries(DAY_WORDS)) {
    if (new RegExp(`\\b${w}s?\\b`).test(text)) { dayOfWeek = n; break; }
  }
  const timeWindow = /\bevening|night\b/.test(text) ? 'evening' : /\blunch|afternoon\b/.test(text) ? 'lunch' : null;
  const lastWeek = /\blast (week|friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/.test(text) && !/\bthis\b/.test(text);
  return { dayOfWeek, timeWindow, lastWeek };
};

module.exports = { detectIntent, extractTarget, INTENTS };
