const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'todos.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readTodos() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeTodos(todos) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2));
}

app.get('/api/todos', (req, res) => {
  res.json(readTodos());
});

app.post('/api/todos', (req, res) => {
  const todos = readTodos();
  const b = req.body;
  const todo = {
    id: Date.now().toString(),
    title: (b.title || '').trim() || 'Untitled',
    status: b.status || 'not-started',
    priority: b.priority || 'Medium',
    effort: b.effort || 'M',
    timeEstimate: b.timeEstimate || '',
    description: (b.description || '').trim(),
    implementationNotes: (b.implementationNotes || '').trim(),
    notes: (b.notes || '').trim(),
    effortJustification: (b.effortJustification || '').trim(),
    timeJustification: (b.timeJustification || '').trim(),
    tags: Array.isArray(b.tags) ? b.tags : [],
    blockedBy: Array.isArray(b.blockedBy) ? b.blockedBy : [],
    benefitsFrom: Array.isArray(b.benefitsFrom) ? b.benefitsFrom : [],
    dependencyNotes: (b.dependencyNotes || '').trim(),
    subTasks: Array.isArray(b.subTasks) ? b.subTasks : [],
    createdAt: new Date().toISOString(),
  };
  todos.push(todo);
  writeTodos(todos);
  res.status(201).json(todo);
});

app.put('/api/todos/:id', (req, res) => {
  const todos = readTodos();
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  todos[idx] = { ...todos[idx], ...req.body, id: req.params.id };
  writeTodos(todos);
  res.json(todos[idx]);
});

app.delete('/api/todos/:id', (req, res) => {
  const todos = readTodos();
  const filtered = todos.filter(t => t.id !== req.params.id);
  if (filtered.length === todos.length) return res.status(404).json({ error: 'Not found' });
  writeTodos(filtered);
  res.json({ ok: true });
});

const ENRICH_SYSTEM = `You are a project management assistant. Fill in the specified empty fields for each todo.

Each todo has a "_fill" array listing exactly which fields need to be populated.
Return ONLY those fields plus "id" — do not repeat fields that are not in "_fill".

Field rules:
- description: 1–3 sentences on what needs to be done and why
- implementationNotes: brief technical approach; omit for non-technical tasks
- notes: AI/automation opportunities for this task
- effortJustification / timeJustification: one concise sentence explaining the estimate
- tags: 1–5 lowercase hyphenated strings relevant to the task
- timeEstimate: xs (<30 min) | s (30min–1hr) | m (1–4hrs) | l (4–16hrs) | xl (1+ days)
- subTasks: [{id:"sub-N",title:"...",status:"not-started"}] — only for clearly multi-step tasks`;

const ENRICH_TOOL = {
  name: 'return_enriched_fields',
  description: 'Return only the newly filled fields for each todo (plus id)',
  input_schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      }
    },
    required: ['todos']
  }
};

const ENRICHABLE = ['description','implementationNotes','notes',
  'effortJustification','timeJustification','tags','subTasks','timeEstimate'];

const isEmpty = v => v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length);

function buildEnrichPayload(todos) {
  return todos
    .filter(t => ENRICHABLE.some(f => isEmpty(t[f])))
    .map(t => {
      const obj = { id: t.id, title: t.title };
      if (t.description)                         obj.description  = t.description;
      if (t.priority && t.priority !== 'Medium') obj.priority     = t.priority;
      if (t.effort   && t.effort   !== 'M')      obj.effort       = t.effort;
      if (t.timeEstimate)                        obj.timeEstimate = t.timeEstimate;
      if (t.tags?.length)                        obj.tags         = t.tags;
      obj._fill = ENRICHABLE.filter(f => isEmpty(t[f]));
      return obj;
    });
}

async function callEnrichBatch(batchPayload) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: ENRICH_SYSTEM,
    tools: [ENRICH_TOOL],
    tool_choice: { type: 'tool', name: 'return_enriched_fields' },
    messages: [{ role: 'user', content: JSON.stringify(batchPayload) }]
  });
  const toolUse = response.content.find(c => c.type === 'tool_use');
  if (!toolUse || !Array.isArray(toolUse.input?.todos)) {
    console.error(`Enrich batch failed. stop_reason=${response.stop_reason}`, JSON.stringify(response.content));
    return [];
  }
  return toolUse.input.todos;
}

app.post('/api/ai/enrich', async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on this server.' });
  try {
    const allTodos = readTodos();
    if (!allTodos.length) return res.json([]);

    const payload = buildEnrichPayload(allTodos);
    if (!payload.length) return res.json(allTodos);

    // Split into batches of 10 and run in parallel to stay within token limits
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      batches.push(payload.slice(i, i + BATCH_SIZE));
    }
    const patches = (await Promise.all(batches.map(callEnrichBatch))).flat();

    const patchById = new Map(patches.map(p => [p.id, p]));
    const merged = allTodos.map(t => {
      const patch = patchById.get(t.id);
      if (!patch) return t;
      const { id: _id, _fill: _f, ...fields } = patch;
      return { ...t, ...fields };
    });

    res.json(merged);
  } catch (err) {
    console.error('AI enrich error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Todo tracker running on http://localhost:${PORT}`);
});
