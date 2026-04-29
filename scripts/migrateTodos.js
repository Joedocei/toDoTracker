'use strict';

const fs = require('fs');
const path = require('path');
const { scoreTodo } = require('../lib/priorityEngine');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'todos.json');

const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

let changed = 0;
const updated = raw.map(todo => {
  const scored = scoreTodo(todo);

  const patch = {
    mainCategory: todo.mainCategory ?? scored.category.main,
    subCategory:  todo.subCategory  ?? scored.category.sub,
    dueDate:      todo.dueDate      ?? scored.dueDate ?? null,
    // Never overwrite an explicitly set moneyTier
    moneyTier:    todo.moneyTier    ?? scored.moneyTier,
  };

  const unchanged = (
    todo.mainCategory === patch.mainCategory &&
    todo.subCategory  === patch.subCategory &&
    todo.dueDate      === patch.dueDate &&
    todo.moneyTier    === patch.moneyTier
  );

  if (unchanged) return todo;
  changed++;
  return { ...todo, ...patch };
});

fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));
console.log(`Migrated ${changed} / ${raw.length} todos → ${DATA_FILE}`);
