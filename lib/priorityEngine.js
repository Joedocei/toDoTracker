'use strict';

const ENGINE_VERSION = 'priority-context-engine-v0.1';

const PRIORITY = { Crucial: 55, 'Very Strong': 42, Strong: 30, Medium: 16, Low: 4 };
const EFFORT = { XS: 15, S: 13, M: 8, L: 1, XL: -8, xs: 15, s: 13, m: 8, l: 1, xl: -8 };
const STATUS = { 'in-flight': 18, 'not-started': 0 };

const CATEGORIES = [
  ['Real Estate / Flip', [/dupuy/i, /flip/i, /stager|cleaner|appliance|utilities/i]],
  ['AI / Automation', [/\bAI\b/i, /claude|gpt|automation|scraper|bot|workflow|tracker|integration/i]],
  ['Real Estate / Dispo', [/dispo|buyer|investorlift|capron|bronze|peachtree|marketing/i]],
  ['W2 / Work', [/j\. clark|wtta|bird'?s eye|prototype/i]],
  ['Network / Personal Brand', [/subto|pace|podcast|meetup|local leader|surplus funds/i]],
  ['Family / Home', [/family|school|volunteer|garage|camry|mt\. gilead/i]],
  ['Finance / Admin', [/tax|financial|verizon|amex|water bill|batteries/i]],
  ['Personal Systems', [/review routine|knowledge base|personal|website/i]],
];

const SIGNALS = [
  ['active real estate money task', 14, [/dispo|underwrite|buyer|marketing|flip|deal|property/i]],
  ['deadline or dated commitment', 10, [/due|target|deadline|by \d{1,2}[/-]\d{1,2}/i]],
  ['daily recurring habit', 8, [/daily|recurring|cadence/i]],
  ['AI or automation leverage', 7, [/\bAI\b|claude|gpt|automation|scraper|bot|workflow/i]],
  ['delegation leverage', 6, [/delegate|\bVA\b|handoff|team/i]],
  ['external relationship involved', 5, [/contact|call|email|follow[- ]?up|schedule/i]],
];

function todoText(todo) {
  return [todo.title, todo.description, todo.notes, todo.implementationNotes, ...(todo.tags || [])].filter(Boolean).join(' ');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null;
}

function parseDueDate(todo, now = new Date()) {
  const text = todoText(todo);
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const mdy = text.match(/\b(?:due|target|deadline|by)\b\s*(?:by\s*)?(?:[:\-]\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i);
  if (!mdy) return null;
  let year = mdy[3] ? Number(mdy[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  return new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));
}

function daysUntil(date, now = new Date()) {
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
}

function dueScore(days) {
  if (days === null) return [0, null];
  if (days < 0) return [30, `overdue by ${Math.abs(days)} day(s)`];
  if (days === 0) return [25, 'due today'];
  if (days <= 2) return [20, `due in ${days} day(s)`];
  if (days <= 7) return [15, `due in ${days} day(s)`];
  if (days <= 14) return [8, `due in ${days} day(s)`];
  return [2, `due in ${days} day(s)`];
}

function inferCategory(todo) {
  const text = todoText(todo);
  const match = CATEGORIES.find(([, patterns]) => patterns.some(pattern => pattern.test(text)));
  return match ? match[0] : 'Uncategorized';
}

function nextAction(todo) {
  const text = todoText(todo);
  if (/call/i.test(text)) return 'Open the contact list and complete the next call block.';
  if (/email/i.test(text)) return 'Draft or send the next required email and log the result.';
  if (/schedule|stager|cleaner/i.test(text)) return 'Send the scheduling text/call and capture the confirmed date/time.';
  if (/buy|appliance|battery/i.test(text)) return 'Price it, buy it, and record the pickup/delivery step.';
  if (/research/i.test(text)) return 'Set a timebox, capture findings, and force a go/no-go decision.';
  if (/build|prototype|tracker|crm/i.test(text)) return 'Define the smallest shippable slice and build only that.';
  if (/delegate|handoff/i.test(text)) return 'Write the handoff instruction and send it to the owner.';
  return 'Run one focused 30-minute block and create a visible outcome.';
}

function scoreTodo(todo, { now = new Date() } = {}) {
  let score = 0;
  const details = [];
  const add = (rule, label, weight) => { score += weight; details.push({ rule, label, weight }); };

  add('priority', todo.priority || 'none', PRIORITY[todo.priority] || 0);
  add('effort', todo.effort || todo.timeEstimate || 'unknown', EFFORT[todo.effort || todo.timeEstimate] || 0);
  if (STATUS[todo.status]) add('status', todo.status, STATUS[todo.status]);

  const dueDate = parseDueDate(todo, now);
  const dueInDays = daysUntil(dueDate, now);
  const [dateWeight, dateLabel] = dueScore(dueInDays);
  if (dateWeight) add('due-date', dateLabel, dateWeight);

  const text = todoText(todo);
  for (const [label, weight, patterns] of SIGNALS) {
    if (patterns.some(pattern => pattern.test(text))) add('signal', label, weight);
  }
  if (todo.blockedBy?.length) add('blocked', `blocked by ${todo.blockedBy.join(', ')}`, -25);
  if (todo.benefitsFrom?.length) add('benefits-from', `${todo.benefitsFrom.length} linked todo(s)`, Math.min(9, todo.benefitsFrom.length * 3));

  return {
    ...todo,
    category: inferCategory(todo),
    dueDate: formatDate(dueDate),
    dueInDays,
    score,
    scoreDetails: details.sort((a, b) => b.weight - a.weight),
    nextAction: nextAction(todo),
  };
}

function reason(todo) {
  return todo.scoreDetails
    .filter(detail => detail.weight > 0)
    .slice(0, 3)
    .map(detail => `${detail.label} (+${detail.weight})`)
    .join('; ');
}

function buildPriorityContext(todos, options = {}) {
  const now = options.now || new Date();
  const limit = Number(options.limit || 12);
  const open = (todos || []).filter(todo => todo && !todo.deleted && todo.status !== 'completed');
  const ranked = open.map(todo => scoreTodo(todo, { now })).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const groups = ranked.reduce((acc, todo) => {
    acc[todo.category] ||= [];
    acc[todo.category].push({ id: todo.id, title: todo.title, score: todo.score });
    return acc;
  }, {});

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: now.toISOString(),
    goal: options.goal || 'Choose the next highest-value todo, ranked list, action plan, and inferred category groups.',
    rules: [
      'Ignore completed and deleted todos.',
      'Prioritize urgency, money movement, external commitments, and leverage over comfort tasks.',
      'Use deterministic scoring as context; AI can override with a clear reason.',
      'Penalize blocked work until the blocker is cleared.',
    ],
    summary: { openCount: open.length, categoryCount: Object.keys(groups).length },
    rankedCandidates: ranked.slice(0, limit).map(todo => ({
      id: todo.id,
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      effort: todo.effort,
      category: todo.category,
      score: todo.score,
      dueDate: todo.dueDate,
      reasonSeed: reason(todo),
      nextAction: todo.nextAction,
      description: todo.description || '',
      notes: todo.notes || '',
    })),
    categoryGroups: groups,
  };
}

function buildRulesRecommendation(context) {
  const rankedTodos = context.rankedCandidates.map((todo, index) => ({
    rank: index + 1,
    id: todo.id,
    title: todo.title,
    category: todo.category,
    score: todo.score,
    reason: `Do ${todo.title} first because ${todo.reasonSeed || 'it is the highest-scored open item'}.`,
    nextAction: todo.nextAction,
  }));
  return {
    nextTodo: rankedTodos[0] || null,
    rankedTodos,
    actionPlan: {
      today: rankedTodos.slice(0, 3).map(todo => `${todo.title}: ${todo.nextAction}`),
      thisWeek: rankedTodos.slice(3, 8).map(todo => `${todo.title} (${todo.category})`),
      nextWeek: rankedTodos.slice(8, 12).map(todo => `${todo.title} (${todo.category})`),
    },
    categories: Object.entries(context.categoryGroups).map(([category, items]) => ({ category, todoIds: items.map(item => item.id) })),
  };
}

const PRIORITIZE_SYSTEM = `You prioritize todos like an operator. Use the rules-engine context as guardrails, then return: one next todo, a ranked list with "Do X first because..." reasoning, a Today/This week/Next week action plan, and category/theme groups. Favor deadlines, revenue, active commitments, and leverage. Do not recommend comfortable low-value work without a strong reason.`;

const PRIORITIZE_TOOL = {
  name: 'return_todo_prioritization',
  description: 'Return next todo, ranked todos, action plan, and category groups.',
  input_schema: {
    type: 'object',
    properties: {
      nextTodo: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' }, nextAction: { type: 'string' }, timeBox: { type: 'string' } }, required: ['id', 'title', 'reason', 'nextAction', 'timeBox'] },
      rankedTodos: { type: 'array', items: { type: 'object', properties: { rank: { type: 'number' }, id: { type: 'string' }, title: { type: 'string' }, category: { type: 'string' }, reason: { type: 'string' }, nextAction: { type: 'string' } }, required: ['rank', 'id', 'title', 'category', 'reason', 'nextAction'] } },
      actionPlan: { type: 'object', properties: { today: { type: 'array', items: { type: 'string' } }, thisWeek: { type: 'array', items: { type: 'string' } }, nextWeek: { type: 'array', items: { type: 'string' } } }, required: ['today', 'thisWeek', 'nextWeek'] },
      categories: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, why: { type: 'string' }, todoIds: { type: 'array', items: { type: 'string' } } }, required: ['category', 'why', 'todoIds'] } },
    },
    required: ['nextTodo', 'rankedTodos', 'actionPlan', 'categories'],
  },
};

module.exports = { ENGINE_VERSION, buildPriorityContext, buildRulesRecommendation, inferCategory, parseDueDate, scoreTodo, PRIORITIZE_SYSTEM, PRIORITIZE_TOOL };
