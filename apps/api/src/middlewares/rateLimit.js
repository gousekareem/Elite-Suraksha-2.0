// Small in-memory fixed-window rate limiter (per user or IP). Suitable for a
// single API instance; use a shared store (e.g. Redis) when scaling out.
const AppError = require('../utils/AppError');

const rateLimit = ({ windowMs = 60000, max = 30, keyPrefix = 'rl' } = {}) => {
  const hits = new Map();
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_IN_TESTS) return next();
    const key = `${keyPrefix}:${req.user?.id || req.ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return next(new AppError('Too many requests. Please slow down and try again shortly.', 429));
    return next();
  };
};

module.exports = rateLimit;
