'use strict';

// Usage: RAILWAY_URL=https://your-app.up.railway.app node scripts/update-todo-railway.js

const BASE = (process.env.RAILWAY_URL || '').replace(/\/$/, '');

if (!BASE) {
  console.error('Set RAILWAY_URL env var, e.g.:');
  console.error('  RAILWAY_URL=https://todotracker-production-6ec8.up.railway.app node scripts/update-todo-railway.js');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const todos = await api('GET', '/api/todos');
  const todo = todos.find(t => t.title === 'Develop personal tracker web app');

  if (!todo) {
    console.error('Could not find "Develop personal tracker web app" in Railway todos.');
    console.log('Titles found:', todos.map(t => t.title));
    process.exit(1);
  }

  console.log(`Found todo id=${todo.id} (status: ${todo.status})`);

  const updated = {
    ...todo,
    status: 'completed',
    priority: 'Strong',
    effort: 'XL',
    timeEstimate: 'xl',
    tags: ['web-app', 'node-js', 'railway', 'ai', 'personal-tools'],
    description: 'Build and deploy a personal todo tracker accessible from phone and desktop. Fully shipped: rich todo fields, AI auto-fill via Claude API, sidebar filters, trash/restore, and Railway deployment with persistent volume storage.',
    effortJustification: 'Full-stack build from scratch — backend API, single-page UI, Railway deployment, AI integration, and multiple iteration cycles.',
    timeJustification: 'Multiple sessions across several days covering design, build, deploy, debugging, and feature additions.',
    implementationNotes: 'Node.js/Express backend, vanilla JS single-page frontend, JSON file storage on Railway Volume (DATA_FILE env var), Anthropic SDK for AI enrichment with batched parallel calls.',
    subTasks: [
      { id: 'sub-1', title: 'Define feature requirements and UI wireframe',        status: 'completed' },
      { id: 'sub-2', title: 'Build Express API with JSON file persistence',         status: 'completed' },
      { id: 'sub-3', title: 'Build single-page UI with sidebar filter layout',      status: 'completed' },
      { id: 'sub-4', title: 'Deploy to Railway with persistent volume storage',     status: 'completed' },
      { id: 'sub-5', title: 'Add rich todo fields (tags, effort, subtasks, deps…)', status: 'completed' },
      { id: 'sub-6', title: 'Add AI auto-fill via Claude API (batched)',            status: 'completed' },
      { id: 'sub-7', title: 'Add trash can with soft-delete and restore',           status: 'completed' },
      { id: 'sub-8', title: 'Add priority, effort, time, tag sidebar filters',      status: 'completed' },
      { id: 'sub-9', title: 'Add AI prioritize / rank / categorize features',       status: 'not-started' },
    ],
  };

  const result = await api('PUT', `/api/todos/${todo.id}`, updated);
  console.log('Updated successfully:', result.title, '->', result.status);
  console.log('Subtasks:', result.subTasks?.length ?? 0);
}

main().catch(err => { console.error(err.message); process.exit(1); });
