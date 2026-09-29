// Boots the real Express app against a clean test database.
require('./env');
process.env.HINDSIGHT_BANK_PREFIX = process.env.HINDSIGHT_BANK_PREFIX || 'elitesuraksha-test-worker-';
const { execFileSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');

const resetDatabase = async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
  execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'migrate-offline.js')], { env: process.env, stdio: 'pipe' });
};

const start = async () => {
  await resetDatabase();
  const app = require('../../src/app');
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, body: json, data: json?.data };
  };
  const stop = async () => {
    // Remove the Hindsight banks this run created so test runs do not accumulate banks.
    const prisma = require('../../src/lib/prisma');
    const { getHindsightService } = require('../../src/services/memory/hindsight.service');
    for (const w of await prisma.workerProfile.findMany({ select: { id: true } })) await getHindsightService().deleteWorkerBank(w.id, { reason: 'test cleanup' });
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await require('../../src/lib/prisma').$disconnect();
  };
  return { call, stop, base };
};

const hindsightReachable = async () => {
  try {
    const r = await fetch(`${process.env.HINDSIGHT_URL || 'http://localhost:8888'}/version`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
};

module.exports = { start, hindsightReachable };
