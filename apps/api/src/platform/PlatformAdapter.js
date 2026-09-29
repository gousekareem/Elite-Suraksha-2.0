// PlatformAdapter: normalises a platform's statement format into EliteSuraksha's
// platform-agnostic records (WorkSession, TripRecord, EarningsRecord).
//
// The rest of the system (analytics, anomaly engine, agent) never sees
// platform-specific shapes, so adding a platform means adding an adapter.

const AppError = require('../utils/AppError');
const { round, sum } = require('../lib/num');
const dates = require('../lib/dates');

const parseClock = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) throw new AppError(`Invalid time "${s}" (expected HH:MM)`, 400);
  return { hour: Number(m[1]), minute: Number(m[2]) };
};

class PlatformAdapter {
  constructor({ code, name, category, unitLabel }) {
    this.code = code;
    this.name = name;
    this.category = category; // DELIVERY | RIDE | FREELANCE
    this.unitLabel = unitLabel; // what one unit of work is called in the UI
  }

  describe() {
    return { code: this.code, name: this.name, category: this.category, unitLabel: this.unitLabel };
  }

  /**
   * Validate + normalise one statement row.
   * Expected generic statement shape:
   * { ref, date, start, end, zone, offered, accepted, rating?, tips?, trips:[{time, zone, km, pay, status}],
   *   incentive?: {program, eligible, amount, note}, deductions?: [{label, amount}] }
   */
  normalizeStatement(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') throw new AppError('Statement must be an object', 400);
    if (typeof raw.ref !== 'string' || !raw.ref.trim()) errors.push('ref is required');
    if (!dates.isDateString(raw.date)) errors.push('date must be YYYY-MM-DD');
    if (typeof raw.zone !== 'string' || !raw.zone.trim()) errors.push('zone is required');
    if (!Array.isArray(raw.trips)) errors.push('trips must be an array');
    if (errors.length) throw new AppError('Invalid platform statement', 400, errors);

    const start = parseClock(raw.start);
    const end = parseClock(raw.end);
    const windowMinutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
    if (windowMinutes <= 0 || windowMinutes > 16 * 60) {
      throw new AppError('Invalid session window', 400, ['end must be after start and within 16 hours']);
    }

    const trips = raw.trips.map((t, i) => {
      const clock = parseClock(t.time);
      const km = Number(t.km);
      const pay = Number(t.pay);
      if (!Number.isFinite(km) || km < 0 || !Number.isFinite(pay) || pay < 0) {
        throw new AppError(`Invalid trip #${i + 1}`, 400);
      }
      return {
        completedAt: dates.istToUtc(raw.date, clock.hour, clock.minute),
        zone: t.zone || raw.zone,
        distanceKm: round(km, 2),
        basePay: round(pay, 2),
        status: t.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED'
      };
    });

    const completed = trips.filter((t) => t.status === 'COMPLETED');
    const cancelled = trips.length - completed.length;
    const busyMinutes = Number.isFinite(Number(raw.activeMinutes))
      ? Number(raw.activeMinutes)
      : Math.min(windowMinutes, completed.length * 11);
    const offered = Number(raw.offered ?? trips.length);
    const accepted = Number(raw.accepted ?? trips.length);

    const zoneBreakdown = {};
    for (const t of completed) zoneBreakdown[t.zone] = (zoneBreakdown[t.zone] || 0) + 1;

    const basePay = round(sum(completed.map((t) => t.basePay)), 2);
    const tips = round(Number(raw.tips || 0), 2);
    const incentive = raw.incentive || null;
    const incentiveAmount = round(Number(incentive?.amount || 0), 2);
    const deductions = Array.isArray(raw.deductions) ? raw.deductions : [];
    const deductionAmount = round(sum(deductions.map((d) => Number(d.amount || 0))), 2);
    const grossEarnings = round(basePay + tips + incentiveAmount, 2);

    return {
      session: {
        externalRef: raw.ref.trim(),
        localDate: raw.date,
        dayOfWeek: dates.dayOfWeek(raw.date),
        startHour: start.hour,
        endHour: end.hour + (end.minute > 0 ? 1 : 0),
        startedAt: dates.istToUtc(raw.date, start.hour, start.minute),
        endedAt: dates.istToUtc(raw.date, end.hour, end.minute),
        zone: raw.zone.trim(),
        platformCode: this.code,
        activeMinutes: busyMinutes,
        idleMinutes: Math.max(0, windowMinutes - busyMinutes),
        ordersOffered: offered,
        ordersAccepted: accepted,
        ordersCompleted: completed.length,
        ordersCancelled: cancelled,
        distanceKm: round(sum(completed.map((t) => t.distanceKm)), 2),
        acceptanceRate: offered > 0 ? round((accepted / offered) * 100, 2) : 0,
        rating: raw.rating === undefined || raw.rating === null ? null : Number(raw.rating),
        zoneBreakdown
      },
      trips,
      earnings: {
        basePay,
        tips,
        incentiveProgram: incentive?.program || null,
        incentiveEligible: incentive ? Boolean(incentive.eligible) : null,
        incentiveAmount,
        incentiveNote: incentive?.note || null,
        deductionAmount,
        deductionBreakdown: deductions.map((d) => ({ label: String(d.label || 'Deduction'), amount: round(Number(d.amount || 0), 2) })),
        grossEarnings,
        netEarnings: round(grossEarnings - deductionAmount, 2)
      }
    };
  }
}

module.exports = PlatformAdapter;
