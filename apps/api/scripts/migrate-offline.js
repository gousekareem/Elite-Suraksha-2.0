#!/usr/bin/env node
// Fallback migration runner for environments where Prisma's schema-engine binary
// cannot be downloaded (air-gapped CI, restricted sandboxes). Applies
// prisma/migrations/*/migration.sql in order and records them in
// _prisma_migrations exactly like `prisma migrate deploy`, so both stay compatible.
// Prefer `npm run db:migrate` (prisma migrate deploy) when it works.

require('../src/config/env');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const dir = path.join(__dirname, '..', 'prisma', 'migrations');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  const applied = new Set((await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map((r) => r.migration_name));
  const names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort();
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const id = crypto.randomUUID();
    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1,$2,$3, now())', [id, checksum, name]);
      await client.query(sql);
      await client.query('UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1', [id]);
      await client.query('COMMIT');
      console.log(`applied ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed ${name}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  await client.end();
  if (!process.exitCode) console.log('database is up to date');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
