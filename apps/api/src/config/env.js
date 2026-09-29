const path = require('path');

// Load the repo-root .env first, then an optional apps/api/.env override.
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const nodeEnv = process.env.NODE_ENV || 'development';

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: '1d',
  refreshTokenExpiresIn: '30d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  demoModeEnabled: bool(process.env.DEMO_MODE_ENABLED, nodeEnv !== 'production'),
  exposeDevOtp: bool(process.env.EXPOSE_DEV_OTP, nodeEnv !== 'production'),

  hindsight: {
    enabled: bool(process.env.HINDSIGHT_ENABLED, true),
    url: process.env.HINDSIGHT_URL || 'http://localhost:8888',
    apiKey: process.env.HINDSIGHT_API_KEY || undefined,
    bankPrefix: process.env.HINDSIGHT_BANK_PREFIX || 'elitesuraksha-worker-',
    recallBudget: process.env.HINDSIGHT_RECALL_BUDGET || 'mid',
    // verbatim: each memory we write (already precise, code-computed text) is stored as one fact.
    // concise: Hindsight's LLM extracts and rephrases facts. Both work with this app.
    retainExtractionMode: process.env.HINDSIGHT_RETAIN_EXTRACTION_MODE || 'verbatim',
    recallTimeoutMs: Number(process.env.HINDSIGHT_RECALL_TIMEOUT_MS || 20000),
    retainTimeoutMs: Number(process.env.HINDSIGHT_RETAIN_TIMEOUT_MS || 120000),
    logOperations: bool(process.env.HINDSIGHT_LOG_OPERATIONS, true)
  },

  llm: {
    provider: (process.env.LLM_PROVIDER || 'none').toLowerCase(),
    apiKey: process.env.LLM_API_KEY || undefined,
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 45000),
    maxToolRounds: Number(process.env.LLM_MAX_TOOL_ROUNDS || 8)
  }
};

const assertRuntimeConfig = () => {
  const missing = [];
  if (!env.databaseUrl) missing.push('DATABASE_URL');
  if (!env.jwtAccessSecret) missing.push('JWT_ACCESS_SECRET');
  if (!env.jwtRefreshSecret) missing.push('JWT_REFRESH_SECRET');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  }
  if (env.isProduction && /change_this/.test(env.jwtAccessSecret)) {
    throw new Error('JWT_ACCESS_SECRET still has the placeholder value; set a real secret in production');
  }
};

module.exports = env;
module.exports.assertRuntimeConfig = assertRuntimeConfig;
