'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Pure functions (mirrored from server.js) ──────────────────────────────────

const ENRICHABLE = ['description','implementationNotes','notes',
  'effortJustification','timeJustification','tags','subTasks','timeEstimate'];

const isEmpty = v =>
  v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length);

function buildPayload(todos) {
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

// alias used in batching tests
const buildEnrichPayload = buildPayload;

function mergePatch(allTodos, patches) {
  const patchById = new Map(patches.map(p => [p.id, p]));
  return allTodos.map(t => {
    const patch = patchById.get(t.id);
    if (!patch) return t;
    const { id: _id, _fill: _f, ...fields } = patch;
    return { ...t, ...fields };
  });
}

// ── Unit tests (no API key required) ─────────────────────────────────────────

describe('buildPayload', () => {
  test('filters out fully-populated todos', () => {
    const todos = [{
      id: '1', title: 'Full',
      description: 'desc', tags: ['a'], timeEstimate: 'm',
      implementationNotes: 'n', notes: 'ai', effortJustification: 'ej',
      timeJustification: 'tj', subTasks: [{ id: 's', title: 'step', status: 'not-started' }],
    }];
    assert.deepEqual(buildPayload(todos), []);
  });

  test('includes todos with at least one empty field', () => {
    const todos = [{ id: '1', title: 'Bare', description: '', tags: [], timeEstimate: '' }];
    const payload = buildPayload(todos);
    assert.equal(payload.length, 1);
    assert.ok(payload[0]._fill.includes('description'));
    assert.ok(payload[0]._fill.includes('tags'));
  });

  test('carries existing non-empty fields as context', () => {
    const todos = [{ id: '1', title: 'T', description: 'existing', tags: [] }];
    const payload = buildPayload(todos);
    assert.equal(payload[0].description, 'existing');
    assert.ok(!payload[0]._fill.includes('description'), 'description already filled');
    assert.ok(payload[0]._fill.includes('tags'));
  });

  test('omits default priority/effort from context', () => {
    const todos = [{ id: '1', title: 'T', priority: 'Medium', effort: 'M', tags: [] }];
    const payload = buildPayload(todos);
    assert.ok(!('priority' in payload[0]), 'default priority should be omitted');
    assert.ok(!('effort'   in payload[0]), 'default effort should be omitted');
  });
});

describe('mergePatch', () => {
  test('merges patch fields into matching todo', () => {
    const todos   = [{ id: '1', title: 'T', description: '', tags: [] }];
    const patches = [{ id: '1', description: 'Filled', tags: ['tag1'] }];
    const result  = mergePatch(todos, patches);
    assert.equal(result[0].description, 'Filled');
    assert.deepEqual(result[0].tags, ['tag1']);
  });

  test('leaves un-patched todos unchanged', () => {
    const todos   = [{ id: '1', description: 'keep' }, { id: '2', description: '' }];
    const patches = [{ id: '2', description: 'new' }];
    const result  = mergePatch(todos, patches);
    assert.equal(result[0].description, 'keep');
    assert.equal(result[1].description, 'new');
  });

  test('strips _fill key from merged result', () => {
    const todos   = [{ id: '1', tags: [] }];
    const patches = [{ id: '1', tags: ['x'], _fill: ['tags'] }];
    const result  = mergePatch(todos, patches);
    assert.ok(!('_fill' in result[0]));
  });

  test('preserves all original fields not in patch', () => {
    const todos   = [{ id: '1', title: 'T', status: 'in-flight', tags: [] }];
    const patches = [{ id: '1', tags: ['x'] }];
    const result  = mergePatch(todos, patches);
    assert.equal(result[0].title, 'T');
    assert.equal(result[0].status, 'in-flight');
  });
});

describe('batching', () => {
  test('splits payload into correct batch sizes', () => {
    const todos = Array.from({ length: 25 }, (_, i) => ({
      id: String(i), title: `Todo ${i}`, tags: [], description: '',
    }));
    const payload = buildEnrichPayload(todos);
    assert.equal(payload.length, 25);

    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < payload.length; i += BATCH_SIZE) batches.push(payload.slice(i, i + BATCH_SIZE));
    assert.equal(batches.length, 3);
    assert.equal(batches[0].length, 10);
    assert.equal(batches[1].length, 10);
    assert.equal(batches[2].length, 5);
  });

  test('merges patches from multiple batches correctly', () => {
    const todos = [
      { id: '1', title: 'A', tags: [] },
      { id: '2', title: 'B', tags: [] },
      { id: '3', title: 'C', tags: [] },
    ];
    const batch1Patches = [{ id: '1', tags: ['x'] }];
    const batch2Patches = [{ id: '2', tags: ['y'] }, { id: '3', tags: ['z'] }];
    const allPatches = [...batch1Patches, ...batch2Patches];
    const result = mergePatch(todos, allPatches);
    assert.deepEqual(result[0].tags, ['x']);
    assert.deepEqual(result[1].tags, ['y']);
    assert.deepEqual(result[2].tags, ['z']);
  });
});

// ── Integration test (requires ANTHROPIC_API_KEY) ────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('\n⚠  Skipping integration test — run with ANTHROPIC_API_KEY=<key> to include it.\n');
} else {
  describe('Anthropic API — live call', () => {
    test('returns enriched fields for 2 sparse todos', { timeout: 30000 }, async () => {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic();

      const payload = [
        { id: 'test-1', title: 'Set up CI/CD pipeline',
          _fill: ['description', 'tags', 'timeEstimate'] },
        { id: 'test-2', title: 'Write user onboarding docs',
          _fill: ['description', 'tags', 'subTasks'] },
      ];

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Fill in the specified empty fields for each todo.
Each todo has a "_fill" array listing which fields need populating.
Return ONLY those fields plus "id" — do not include fields not in "_fill".
Field rules: description: 1–3 sentences. tags: 1–5 lowercase hyphenated strings.
timeEstimate: xs|s|m|l|xl. subTasks: [{id,title,status:"not-started"}].`,
        tools: [{
          name: 'return_enriched_fields',
          description: 'Return only the newly filled fields for each todo (plus id)',
          input_schema: {
            type: 'object',
            properties: {
              todos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
              },
            },
            required: ['todos'],
          },
        }],
        tool_choice: { type: 'tool', name: 'return_enriched_fields' },
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      });

      // ── Diagnostic output ──
      console.log('\n  stop_reason  :', response.stop_reason);
      console.log('  content types:', response.content.map(c => c.type));

      const toolUse = response.content.find(c => c.type === 'tool_use');
      if (toolUse) {
        console.log('  input type   :', typeof toolUse.input);
        console.log('  input keys   :', toolUse.input ? Object.keys(toolUse.input) : 'n/a');
        console.log('  todos type   :', Array.isArray(toolUse.input?.todos) ? 'array' : typeof toolUse.input?.todos);
        console.log('\n  Enriched output:');
        const todos = Array.isArray(toolUse.input?.todos) ? toolUse.input.todos : toolUse.input;
        console.log(JSON.stringify(todos, null, 4));
      } else {
        console.log('  !! No tool_use block. Full content:');
        console.log(JSON.stringify(response.content, null, 2));
      }

      // ── Assertions ──
      assert.ok(toolUse, 'Response must contain a tool_use block');
      const input = typeof toolUse.input === 'string'
        ? JSON.parse(toolUse.input) : toolUse.input;
      assert.ok(Array.isArray(input?.todos), `input.todos must be an array, got: ${JSON.stringify(input)}`);
      assert.equal(input.todos.length, 2, 'Should return entries for both test todos');
      for (const t of input.todos) {
        assert.ok(t.id, 'Each entry must have an id');
      }
    });
  });
}
