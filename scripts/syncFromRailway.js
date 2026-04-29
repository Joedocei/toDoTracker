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

async function main() {
  console.log(`Fetching from ${BASE}/api/todos ...`);
  const res = await fetch(`${BASE}/api/todos`);
  if (!res.ok) throw new Error(`GET /api/todos → ${res.status}`);

  const todos = await res.json();
  const dest  = path.join(__dirname, '..', 'data', 'todos.json');

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(todos, null, 2));

  console.log(`Synced ${todos.length} todos → data/todos.json`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
