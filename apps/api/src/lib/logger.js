// Minimal structured logger. Never pass secrets or raw tokens to it.
const env = require('../config/env');

const REDACT = /(api[_-]?key|authorization|token|secret|password)/i;

const scrub = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 3) return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
};

const write = (level, tag, message, meta) => {
  if (env.isTest && level !== 'error' && !process.env.LOG_IN_TESTS) return;
  const line = `[${tag}] ${message}`;
  const extra = meta ? ` ${JSON.stringify(scrub(meta))}` : '';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(line + extra);
};

module.exports = {
  info: (tag, message, meta) => write('info', tag, message, meta),
  warn: (tag, message, meta) => write('warn', tag, message, meta),
  error: (tag, message, meta) => write('error', tag, message, meta),
  scrub
};
