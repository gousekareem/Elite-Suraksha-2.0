#!/usr/bin/env node
// Lightweight lint: syntax-checks every JS file in src/, scripts/ and test/.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['src', 'scripts', 'test'].map((d) => path.join(__dirname, '..', d));
const files = [];
const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (e.name.endsWith('.js')) files.push(p);
});
roots.forEach(walk);
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { failed += 1; console.error(e.stderr.toString()); }
}
console.log(`${files.length - failed}/${files.length} files passed syntax check`);
process.exit(failed ? 1 : 0);
