#!/usr/bin/env node
// Runs the Prisma CLI with the same environment the API uses (repo-root .env,
// optionally overridden by apps/api/.env), so DATABASE_URL is always found.
require('../src/config/env');
const { spawnSync } = require('child_process');
const path = require('path');

const bin = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: path.join(__dirname, '..') });
process.exit(r.status ?? 1);
