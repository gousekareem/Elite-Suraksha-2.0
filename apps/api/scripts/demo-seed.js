#!/usr/bin/env node
// Seed the synthetic demo.
//   npm run demo:seed       → reset + load Phase 1 history (start of the Judge Demo)
//   npm run demo:scenario   → run the whole story up to the time jump (second anomaly ready)
// Uses the same services as the UI, including real Hindsight retain calls.

const env = require('../src/config/env');
env.assertRuntimeConfig();
const demo = require('../src/demo/demo.service');
const prisma = require('../src/lib/prisma');

(async () => {
  const full = process.argv.includes('--full');
  const t0 = Date.now();
  if (full) {
    await demo.runFullScenario();
  } else {
    await demo.reset();
    await demo.loadHistory();
  }
  const s = await demo.state();
  console.log(JSON.stringify({ mode: full ? 'full scenario' : 'history loaded', asOf: s.asOf, sessions: s.sessions, anomalies: s.anomalies, investigations: s.investigations, memory: s.memory, hindsight: s.hindsight.label, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await prisma.$disconnect();
  process.exit(1);
});
