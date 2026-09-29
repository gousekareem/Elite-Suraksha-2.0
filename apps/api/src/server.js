const env = require('./config/env');

env.assertRuntimeConfig();

const app = require('./app');
const logger = require('./lib/logger');
const { getHindsightService } = require('./services/memory/hindsight.service');
const llm = require('./services/agent/llm');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

app.listen(env.port, async () => {
  logger.info('API', `EliteSuraksha 2.0 API running on http://localhost:${env.port}`);
  
  // Run migrations on startup (for free tier Render)
  try {
    logger.info('DB', 'Running migrations...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id SERIAL PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        finished_at TIMESTAMPTZ,
        execution_time BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        logs TEXT,
        rolled_back_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        applied_steps_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: __dirname });
    logger.info('DB', 'Migrations completed ✓');
  } catch (err) {
    logger.info('DB', `Migrations: ${err.message}`);
  }
  
  const hs = await getHindsightService().status({ fresh: true });
  logger.info('HINDSIGHT', hs.connected ? `connected to ${hs.endpoint} (API ${hs.version})` : `not reachable at ${hs.endpoint || 'n/a'} — the agent will run on structured records only until Hindsight is available`);
  const r = llm.describe();
  logger.info('AGENT', r.engine === 'llm' ? `LLM interpretation enabled (${r.provider} · ${r.model})` : 'LLM not configured — deterministic reasoning engine in use');
});
