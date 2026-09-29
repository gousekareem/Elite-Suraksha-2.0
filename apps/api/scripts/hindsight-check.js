#!/usr/bin/env node
// Verifies the configured Hindsight server with a real retain → recall round trip
// in a throwaway bank, then deletes it. Prints [HINDSIGHT] lines as evidence.

require('../src/config/env');
const { HindsightClient } = require('@vectorize-io/hindsight-client');

(async () => {
  const url = process.env.HINDSIGHT_URL || 'http://localhost:8888';
  const client = new HindsightClient({ baseUrl: url, apiKey: process.env.HINDSIGHT_API_KEY || undefined });
  const bank = `elitesuraksha-check-${Date.now()}`;
  const v = await client.getVersion();
  console.log(`[HINDSIGHT] connected ${new URL(url).host} api=${v.api_version}`);
  await client.retain(bank, 'Check worker usually works Friday evening shifts in Zone A and earns about ₹1,000 net.', { documentId: 'check', tags: ['cat:earnings_pattern'], metadata: { category: 'earnings_pattern' } });
  console.log(`[HINDSIGHT] RETAIN bank=${bank} ok`);
  const r = await client.recall(bank, 'What does the worker earn on Friday evenings?');
  console.log(`[HINDSIGHT] RECALL bank=${bank} results=${r.results.length}`);
  r.results.slice(0, 3).forEach((x) => console.log(`  • ${x.text}`));
  await client.deleteBank(bank);
  console.log(`[HINDSIGHT] DELETE_BANK bank=${bank} ok`);
})().catch((err) => {
  console.error(`[HINDSIGHT] check failed: ${err.message}`);
  process.exit(1);
});
