'use strict';

// Usage: RAILWAY_URL=https://your-app.up.railway.app node scripts/syncFromRailway.js
// Or:    npm run sync

const fs   = require('fs');
const path = require('path');

const BASE = (process.env.RAILWAY_URL || '').replace(/\/$/, '');

if (!BASE) {
  console.error('Set RAILWAY_URL, e.g.:');
  console.error('  RAILWAY_URL=https://todotracker-production-6ec8.up.railway.app npm run sync');
  process.exit(1);
}

async function fetchAndWrite(url, dest, label) {
  console.log(`Fetching from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const data = await res.json();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(data, null, 2));
  console.log(`Synced ${data.length} ${label} → ${path.relative(path.join(__dirname, '..'), dest)}`);
}

async function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  await Promise.all([
    fetchAndWrite(`${BASE}/api/todos`,    path.join(dataDir, 'todos.json'),    'todos'),
    fetchAndWrite(`${BASE}/api/projects`, path.join(dataDir, 'projects.json'), 'projects'),
  ]);
}

main().catch(err => { console.error(err.message); process.exit(1); });
