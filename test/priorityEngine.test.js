'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildPriorityContext, buildRulesRecommendation, inferCategory, parseDueDate, scoreTodo } = require('../lib/priorityEngine');

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('priorityEngine', () => {
  test('ignores completed and deleted todos', () => {
    const context = buildPriorityContext([
      { id: '1', title: 'Open', status: 'not-started', priority: 'Crucial', effort: 'S' },
      { id: '2', title: 'Done', status: 'completed', priority: 'Crucial', effort: 'S' },
      { id: '3', title: 'Trash', status: 'not-started', priority: 'Crucial', effort: 'S', deleted: true },
    ], { now: NOW });
    assert.equal(context.summary.openCount, 1);
    assert.equal(context.rankedCandidates[0].id, '1');
  });

  test('ranks crucial external work above low priority work', () => {
    const context = buildPriorityContext([
      { id: 'low', title: 'Low value build task', status: 'not-started', priority: 'Low', effort: 'L' },
      { id: 'crucial', title: 'Crucial seller call', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    assert.equal(context.rankedCandidates[0].id, 'crucial');
  });

  test('extracts due dates and urgency score', () => {
    const todo = { id: '1', title: 'Podcast prep', notes: 'Due 4/17', status: 'not-started', priority: 'Strong', effort: 'M' };
    const dueDate = parseDueDate(todo, NOW);
    const scored = scoreTodo(todo, { now: NOW });
    assert.equal(dueDate.getFullYear(), 2026);
    assert.equal(scored.dueDate, '2026-04-17');
    assert.ok(scored.scoreDetails.some(detail => detail.rule === 'due-date' && detail.weight === 30));
  });

  test('infers useful categories', () => {
    assert.equal(inferCategory({ title: 'Dupuy Flip — schedule stagers + cleaners' }), 'Real Estate / Flip');
    assert.equal(inferCategory({ title: 'AI Quick Win — Facebook deal scraper bot' }), 'AI / Automation');
    assert.equal(inferCategory({ title: 'Move Verizon WiFi from BoA to AMEX' }), 'Finance / Admin');
  });

  test('builds fallback recommendation with ranked list, action plan, and groups', () => {
    const context = buildPriorityContext([
      { id: '101', title: 'Dupuy Flip — cut utilities', status: 'not-started', priority: 'Crucial', effort: 'S', notes: 'Target: by 4/15' },
      { id: '104', title: 'RvP Dispo — Capron: make more calls', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    const recommendation = buildRulesRecommendation(context);
    assert.ok(recommendation.nextTodo);
    assert.ok(recommendation.rankedTodos.length > 0);
    assert.ok(recommendation.actionPlan.today.length > 0);
    assert.ok(recommendation.categories.length > 0);
  });
});
