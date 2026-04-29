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

app.post('/api/ai/enrich', async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on this server.' });
  try {
    const todos = readTodos();
    if (!todos.length) return res.json([]);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: `You are a project management assistant. Fill in empty fields on todo tasks using the task title and any existing context as your guide.

RULES:
- Only fill fields that are empty: empty string "" or empty array []
- NEVER change: id, title, status, createdAt, blockedBy, benefitsFrom
- priority default is "Medium" — only change if the title strongly implies different urgency
- effort default is "M" — only change if the scale is clearly wrong
- Keep all existing non-empty values exactly as-is
- Valid priority values: Crucial, Very Strong, Strong, Medium, Low
- Valid effort values: XS, S, M, L, XL
- Valid timeEstimate values: xs (<30 min), s (30min–1hr), m (1–4hrs), l (4–16hrs), xl (1+ days)
- tags: 1–5 lowercase single-word or hyphenated strings
- subTasks: 2–5 concrete steps only if the task warrants them; format { "id": "sub-0", "title": "...", "status": "not-started" }
- description: 1–3 sentences on what needs to be done and why
- implementationNotes: brief technical approach (omit if non-technical)
- notes: AI/automation opportunities for this task
- effortJustification / timeJustification: one sentence explaining the estimate`,
      tools: [{
        name: 'return_enriched_todos',
        description: 'Return the todos array with empty fields filled in',
        input_schema: {
          type: 'object',
          properties: { todos: { type: 'array', items: { type: 'object' } } },
          required: ['todos']
        }
      }],
      tool_choice: { type: 'tool', name: 'return_enriched_todos' },
      messages: [{ role: 'user', content: JSON.stringify(todos) }]
    });

    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) return res.status(500).json({ error: 'No structured response from AI.' });
    res.json(toolUse.input.todos);
  } catch (err) {
    console.error('AI enrich error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Todo tracker running on http://localhost:${PORT}`);
});
