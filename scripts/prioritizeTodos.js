'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const {
  buildPriorityContext,
  buildRulesRecommendation,
  PRIORITIZE_SYSTEM,
  PRIORITIZE_TOOL,
} = require('../lib/priorityEngine');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'todos.json');
const useAi = process.argv.includes('--ai');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 12;

function readTodos() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

async function askAi(context) {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: PRIORITIZE_SYSTEM,
    tools: [PRIORITIZE_TOOL],
    tool_choice: { type: 'tool', name: 'return_todo_prioritization' },
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });
  const toolUse = response.content.find(part => part.type === 'tool_use');
  if (!toolUse?.input?.nextTodo) throw new Error('AI did not return a valid prioritization payload.');
  return toolUse.input;
}

(async () => {
  const context = buildPriorityContext(readTodos(), { limit });
  const rulesRecommendation = buildRulesRecommendation(context);

  if (!useAi) {
    console.log(JSON.stringify({ source: 'rules-engine', context, recommendation: rulesRecommendation }, null, 2));
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(JSON.stringify({ source: 'rules-engine-no-api-key', context, recommendation: rulesRecommendation }, null, 2));
    process.exitCode = 1;
    return;
  }

  const recommendation = await askAi(context);
  console.log(JSON.stringify({ source: 'anthropic', context, recommendation }, null, 2));
})().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
