// Local-date helpers. All worker dates are stored as 'YYYY-MM-DD' strings in the
// worker's local calendar (Asia/Kolkata), so arithmetic here is timezone-free.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MIN = 330;

const isDateString = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const parse = (s) => {
  if (!isDateString(s)) throw new Error(`Invalid local date: ${s}`);
  return new Date(`${s}T00:00:00Z`);
};

const format = (d) => d.toISOString().slice(0, 10);

const addDays = (s, n) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
};

const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);

const dayOfWeek = (s) => parse(s).getUTCDay();

const todayIST = () => format(new Date(Date.now() + IST_OFFSET_MIN * 60000));

// Convert a local IST wall-clock time to a UTC Date.
const istToUtc = (s, hour, minute = 0) => new Date(Date.parse(`${s}T00:00:00Z`) + (hour * 60 + minute - IST_OFFSET_MIN) * 60000);

const pretty = (s) => {
  const d = parse(s);
  return `${DAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const short = (s) => {
  const d = parse(s);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

module.exports = {
  DAY_NAMES,
  DAY_CODES,
  isDateString,
  parse,
  format,
  addDays,
  diffDays,
  dayOfWeek,
  todayIST,
  istToUtc,
  pretty,
  short,
  hourLabel
};
