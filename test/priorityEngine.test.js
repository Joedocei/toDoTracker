'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPriorityContext,
  buildRulesRecommendation,
  inferCategory,
  inferMoneyTier,
  detectAiAssist,
  detectLowContext,
  parseDueDate,
  scoreTodo,
} = require('../lib/priorityEngine');

const NOW = new Date('2026-04-29T12:00:00.000Z');

describe('priorityEngine', () => {

  // ── Filtering ───────────────────────────────────────────────────────────────
  test('ignores completed and deleted todos', () => {
    const context = buildPriorityContext([
      { id: '1', title: 'Open',  status: 'not-started', priority: 'Crucial', effort: 'S' },
      { id: '2', title: 'Done',  status: 'completed',   priority: 'Crucial', effort: 'S' },
      { id: '3', title: 'Trash', status: 'not-started', priority: 'Crucial', effort: 'S', deleted: true },
    ], { now: NOW });
    assert.equal(context.summary.openCount, 1);
    assert.equal(context.rankedCandidates[0].id, '1');
  });

  // ── Ranking ─────────────────────────────────────────────────────────────────
  test('money-now tasks outrank money-soon tasks of same priority', () => {
    const context = buildPriorityContext([
      { id: 'soon', title: 'SubTo surplus funds call',   status: 'not-started', priority: 'Crucial', effort: 'S' },
      { id: 'now',  title: 'Dupuy Flip — cut utilities', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    assert.equal(context.rankedCandidates[0].id, 'now');
  });

  test('deadline urgency can pull a money-soon task above a money-now task', () => {
    const context = buildPriorityContext([
      { id: 'now',  title: 'Dupuy Flip — cut utilities',              status: 'not-started', priority: 'Crucial', effort: 'S' },
      { id: 'soon', title: 'J. Clark WTTA updates', notes: 'Due 4/29', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    // Due-today bonus (+25) on the J. Clark task should push it past the flip task
    assert.equal(context.rankedCandidates[0].id, 'soon');
  });

  test('effort acts as tiebreaker — smaller effort wins when all else equal', () => {
    const context = buildPriorityContext([
      { id: 'big',   title: 'Dupuy Flip — buy kitchen appliances', status: 'not-started', priority: 'Crucial', effort: 'XL' },
      { id: 'small', title: 'Dupuy Flip — cut utilities',          status: 'not-started', priority: 'Crucial', effort: 'XS' },
    ], { now: NOW });
    assert.equal(context.rankedCandidates[0].id, 'small');
  });

  test('effort tiebreaker cannot override a priority tier gap', () => {
    // XS effort adds only 5pts; Crucial-to-Strong gap is 25pts — crucial must still win
    const context = buildPriorityContext([
      { id: 'crucial', title: 'Dupuy Flip — schedule stagers', status: 'not-started', priority: 'Crucial', effort: 'XL' },
      { id: 'strong',  title: 'AI audit task',                 status: 'not-started', priority: 'Strong',  effort: 'XS' },
    ], { now: NOW });
    assert.equal(context.rankedCandidates[0].id, 'crucial');
  });

  // ── Category inference ───────────────────────────────────────────────────────
  test('infers Real Estate / Flip for Dupuy tasks', () => {
    const cat = inferCategory({ title: 'Dupuy Flip — schedule stagers + cleaners' });
    assert.equal(cat.main, 'Real Estate');
    assert.equal(cat.sub,  'Flip');
  });

  test('infers Real Estate / RvP Dispo for specific properties', () => {
    const cat = inferCategory({ title: 'RvP Dispo — Capron: make more calls' });
    assert.equal(cat.main, 'Real Estate');
    assert.equal(cat.sub,  'RvP Dispo');
  });

  test('infers Real Estate / RvP Operations for machine-building tasks', () => {
    const cat = inferCategory({ title: 'RvP Dispo Automation — research + build plan' });
    assert.equal(cat.main, 'Real Estate');
    assert.equal(cat.sub,  'RvP Operations');
  });

  test('infers Real Estate / SubTo for SubTo tasks', () => {
    const cat = inferCategory({ title: 'SubTo — surplus funds call with Bruce' });
    assert.equal(cat.main, 'Real Estate');
    assert.equal(cat.sub,  'SubTo');
  });

  test('infers Personal / Ventures for J. Clark tasks', () => {
    const cat = inferCategory({ title: 'J. Clark — WTTA updates' });
    assert.equal(cat.main, 'Personal');
    assert.equal(cat.sub,  'Ventures');
  });

  test('does not misfire "financial tracker" into AI / Automation', () => {
    const cat = inferCategory({ title: 'Build personal financial tracker' });
    assert.equal(cat.main, 'Personal');
    assert.equal(cat.sub,  'Financial');
  });

  // ── Money-tier inference ─────────────────────────────────────────────────────
  test('flip and dispo categories infer money-now', () => {
    assert.equal(inferMoneyTier({}, { main: 'Real Estate', sub: 'Flip' }),     'money-now');
    assert.equal(inferMoneyTier({}, { main: 'Real Estate', sub: 'RvP Dispo' }), 'money-now');
  });

  test('explicit moneyTier on todo overrides category inference', () => {
    assert.equal(inferMoneyTier({ moneyTier: 'money-now' }, { main: 'Personal', sub: 'Development' }), 'money-now');
  });

  // ── Due dates ────────────────────────────────────────────────────────────────
  test('first-class dueDate field takes precedence over text parsing', () => {
    const todo = { id: '1', title: 'Task', dueDate: '2026-05-10', notes: 'Due 4/14' };
    const date = parseDueDate(todo, NOW);
    assert.equal(date.getMonth(), 4); // May = index 4, not April = 3
  });

  test('parses due date from notes text and flags overdue', () => {
    const todo   = { id: '1', title: 'Podcast prep', notes: 'Due 4/17', status: 'not-started', priority: 'Strong', effort: 'M' };
    const scored = scoreTodo(todo, { now: NOW });
    assert.equal(scored.dueDate,   '2026-04-17');
    assert.equal(scored.isOverdue, true);
    assert.ok(scored.scoreDetails.some(d => d.rule === 'due-date' && d.weight === 30));
  });

  // ── Flags ────────────────────────────────────────────────────────────────────
  test('overdue todos surface in context flags', () => {
    const context = buildPriorityContext([
      { id: '1', title: 'Overdue task', notes: 'Due 4/10', status: 'not-started', priority: 'Strong', effort: 'S' },
      { id: '2', title: 'No date task',                     status: 'not-started', priority: 'Strong', effort: 'S' },
    ], { now: NOW });
    assert.equal(context.flags.overdueTodos.length, 1);
    assert.equal(context.flags.overdueTodos[0].id, '1');
  });

  test('low-context todos are flagged when description + notes under 30 chars', () => {
    assert.equal(detectLowContext({ title: 'Make plan for the yellows', description: '', notes: '' }), true);
  });

  test('todos with sufficient context are not flagged as low-context', () => {
    assert.equal(detectLowContext({ title: 'Task', description: 'This is a detailed enough description to pass the threshold check.' }), false);
  });

  // ── AI-assist detection ───────────────────────────────────────────────────────
  test('detects ai-assist for copy and writing tasks', () => {
    assert.equal(detectAiAssist({ title: 'AI Quick Win — FB/email copy (Capron, Bronze, Peachtree)', effort: 'S' }), true);
    assert.equal(detectAiAssist({ title: 'Write marketing email draft', effort: 'S' }), true);
  });

  test('respects explicit aiAssist override on the todo', () => {
    assert.equal(detectAiAssist({ title: 'Call Bruce', effort: 'S', aiAssist: true }),  true);
    assert.equal(detectAiAssist({ title: 'Write copy', effort: 'S', aiAssist: false }), false);
  });

  // ── Session context ───────────────────────────────────────────────────────────
  test('sessionContext passes timeAvailable and userContext through to the payload', () => {
    const context = buildPriorityContext([], { now: NOW, timeAvailable: '2 hours', userContext: 'heavy work day' });
    assert.equal(context.sessionContext.timeAvailable, '2 hours');
    assert.equal(context.sessionContext.userContext,   'heavy work day');
    assert.equal(context.sessionContext.dayOfWeek,     'Wednesday');
  });

  // ── Category groups ───────────────────────────────────────────────────────────
  test('category groups use main / sub key format', () => {
    const context = buildPriorityContext([
      { id: '1', title: 'Dupuy Flip — cut utilities', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    assert.ok(Object.keys(context.categoryGroups).includes('Real Estate / Flip'));
  });

  // ── Rules recommendation ──────────────────────────────────────────────────────
  test('builds rules recommendation with ranked list, action plan, and groups', () => {
    const context = buildPriorityContext([
      { id: '101', title: 'Dupuy Flip — cut utilities',     status: 'not-started', priority: 'Crucial', effort: 'S' },
      { id: '104', title: 'RvP Dispo — Capron: make calls', status: 'not-started', priority: 'Crucial', effort: 'S' },
    ], { now: NOW });
    const rec = buildRulesRecommendation(context);
    assert.ok(rec.nextTodo);
    assert.ok(rec.rankedTodos.length > 0);
    assert.ok(rec.actionPlan.today.length > 0);
    assert.ok(rec.categories.length > 0);
  });

});
