const express = require('express');
const fs = require('fs');
const path = require('path');

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

app.listen(PORT, () => {
  console.log(`Todo tracker running on http://localhost:${PORT}`);
});
