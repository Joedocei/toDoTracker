'use strict';

const ENGINE_VERSION = 'priority-context-engine-v0.2';

// ── Scoring tables ────────────────────────────────────────────────────────────
const PRIORITY_SCORE   = { Crucial: 55, 'Very Strong': 42, Strong: 30, Medium: 16, Low: 4 };
const MONEY_TIER_SCORE = { 'money-now': 40, 'money-soon': 20, 'time-sensitive': 10, research: 0 };
// Effort is a quick-win tiebreaker — max 4pt spread cannot override a priority-tier gap (min 13pts)
const EFFORT_SCORE     = { XS: 5, S: 4, M: 3, L: 2, XL: 1, xs: 5, s: 4, m: 3, l: 2, xl: 1 };
const STATUS_SCORE     = { 'in-flight': 18, 'not-started': 0 };

// ── Category map ──────────────────────────────────────────────────────────────
// Ordered most-specific first to avoid misfires. [main, sub, [patterns]]
const CATEGORY_MAP = [
  // Real Estate — Flip (active Dupuy flip)
  ['Real Estate', 'Flip',
    [/dupuy/i, /\bflip\b/i, /stager|cleaner/i, /kitchen applian/i]],

  // Real Estate — RvP Dispo (active outreach on specific properties)
  ['Real Estate', 'RvP Dispo',
    [/capron|bronze|peachtree/i, /buyers site/i, /investorlift/i,
     /dispo cadence/i, /seth.*oni|oni.*seth/i, /rvp.*doc review|doc review.*rvp/i]],

  // Real Estate — RvP Operations (machine-building, systems, automation)
  ['Real Estate', 'RvP Operations',
    [/dispo automat/i, /underwrite.*email|underwrite.*deal|daily.*underwrite/i,
     /google sheet.*crm|crm.*deal|deal tracking/i, /left main/i,
     /deal scraper/i, /rvp.*integrat|integrat.*rvp/i]],

  // Real Estate — SubTo (creative finance community)
  ['Real Estate', 'SubTo',
    [/\bsubto\b/i, /surplus funds/i, /local leader/i,
     /\bmeetup\b/i, /get creative/i, /creative podcast/i]],

  // Real Estate — Research (new opportunities, markets, exit strategies)
  ['Real Estate', 'Research',
    [/oxford homes/i, /padmission/i, /\bcoc\b|continuum of care/i,
     /lexington propert/i, /the yellows|plan.*yellow/i, /lease.from.you/i]],

  // LTD — Leadership Team Development
  ['LTD', null,
    [/\bltd\b/i, /leadership team/i]],

  // Personal — Ventures (client work and side business ideas)
  ['Personal', 'Ventures',
    [/j\.?\s*clark|bird.s eye|\bwtta\b/i,
     /claude.*website.*builder|website.*builder.*side/i]],

  // Personal — Financial
  ['Personal', 'Financial',
    [/financial tracker/i, /tax review/i, /verizon/i,
     /\bamex\b/i, /water bill/i, /pest control/i, /boa.*amex|amex.*boa/i]],

  // Personal — Family
  ['Personal', 'Family',
    [/\bmaris\b/i, /school schedule/i, /mt\.?\s*gilead/i,
     /garage door|camry key/i, /family.*volunteer|volunteer.*family/i]],

  // Personal — Development (habits, skills, personal brand)
  ['Personal', 'Development',
    [/pace audit/i, /weekly review|review routine/i, /knowledge base/i,
     /joedoceihill/i, /personal.*gpt/i, /ai.*replaceable|replaceable.*tasks/i,
     /strengths review/i]],
];

// ── Money-tier inferred from category when not explicitly set on the todo ─────
const CATEGORY_MONEY_TIER = {
  'Real Estate|Flip':           'money-now',
  'Real Estate|RvP Dispo':      'money-now',
  'Real Estate|RvP Operations': 'money-soon',
  'Real Estate|SubTo':          'money-soon',
  'Real Estate|Research':       'research',
  'LTD|null':                   'money-soon',
  'Personal|Ventures':          'money-soon',
  'Personal|Financial':         'time-sensitive',
  'Personal|Family':            'time-sensitive',
  'Personal|Development':       'research',
};

// ── Bonus signals ─────────────────────────────────────────────────────────────
const SIGNALS = [
  ['deadline or dated commitment',   10, [/due|target|deadline|by \d{1,2}[/-]\d{1,2}/i]],
  ['daily recurring habit',           8, [/daily|recurring|cadence/i]],
  ['AI or automation leverage',       6, [/\bAI\b|claude|gpt|automation|scraper|bot|workflow/i]],
  ['delegation leverage',             5, [/delegate|\bVA\b|handoff|team/i]],
  ['external relationship involved',  4, [/contact|call|email|follow[- ]?up|schedule/i]],
];

// ── AI-assist detection ───────────────────────────────────────────────────────
const AI_ASSIST_PATTERNS = [
  /\bcopy\b/i,
  /\bdraft\b/i,
  /\bwrite\b|\bwriting\b/i,
  /\bsummariz/i,
  /\baudit\b/i,
  /\bscraper\b/i,
  /\btemplate\b/i,
  /email.*marketing|marketing.*email/i,
  /fb.*post|facebook.*post/i,
  /ai.*quick win|quick win.*ai/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function todoText(todo) {
  return [todo.title, todo.description, todo.notes, todo.implementationNotes, ...(todo.tags || [])]
    .filter(Boolean).join(' ');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDueDate(todo, now = new Date()) {
  // First-class dueDate field wins over text parsing
  if (todo.dueDate) return new Date(todo.dueDate);
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
  if (days < 0)   return [30, `overdue by ${Math.abs(days)} day(s)`];
  if (days === 0) return [25, 'due today'];
  if (days <= 2)  return [20, `due in ${days} day(s)`];
  if (days <= 7)  return [15, `due in ${days} day(s)`];
  if (days <= 14) return [8,  `due in ${days} day(s)`];
  return [2, `due in ${days} day(s)`];
}

// ── Category inference ────────────────────────────────────────────────────────
function inferCategory(todo) {
  const text = todoText(todo);
  const match = CATEGORY_MAP.find(([, , patterns]) => patterns.some(p => p.test(text)));
  if (match) return { main: match[0], sub: match[1] };
  return { main: 'Personal', sub: 'Development' };
}

// ── Money-tier ────────────────────────────────────────────────────────────────
function inferMoneyTier(todo, category) {
  if (todo.moneyTier) return todo.moneyTier;
  const key = `${category.main}|${category.sub}`;
  return CATEGORY_MONEY_TIER[key] || 'research';
}

// ── AI-assist detection ───────────────────────────────────────────────────────
function detectAiAssist(todo) {
  if (todo.aiAssist !== undefined) return todo.aiAssist; // explicit user override
  const text   = todoText(todo);
  const effort = (todo.effort || todo.timeEstimate || '').toLowerCase();
  const isSmall   = ['xs', 's'].includes(effort);
  const hasPattern = AI_ASSIST_PATTERNS.some(p => p.test(text));
  return hasPattern || (isSmall && /\b(write|draft|copy|email|post|research|summarize)\b/i.test(text));
}

// ── Low-context detection ─────────────────────────────────────────────────────
function detectLowContext(todo) {
  const ctx = [todo.description, todo.notes].filter(Boolean).join(' ').trim();
  return ctx.length < 30;
}

// ── Next-action seed ──────────────────────────────────────────────────────────
function nextAction(todo) {
  const text = todoText(todo);
  if (/call/i.test(text))                    return 'Open the contact list and complete the next call block.';
  if (/email/i.test(text))                   return 'Draft or send the next required email and log the result.';
  if (/schedule|stager|cleaner/i.test(text)) return 'Send the scheduling text/call and capture the confirmed date/time.';
  if (/buy|appliance|battery/i.test(text))   return 'Price it, buy it, and record the pickup/delivery step.';
  if (/research/i.test(text))                return 'Set a timebox, capture findings, and force a go/no-go decision.';
  if (/build|prototype|tracker|crm/i.test(text)) return 'Define the smallest shippable slice and build only that.';
  if (/delegate|handoff/i.test(text))        return 'Write the handoff instruction and send it to the owner.';
  if (/write|copy|draft/i.test(text))        return 'Open a doc, write the first draft, and review before sending.';
  return 'Run one focused 30-minute block and create a visible outcome.';
}

// ── Per-todo scorer ───────────────────────────────────────────────────────────
function scoreTodo(todo, { now = new Date() } = {}) {
  const category  = inferCategory(todo);
  const moneyTier = inferMoneyTier(todo, category);

  let score = 0;
  const details = [];
  const add = (rule, label, weight) => { score += weight; details.push({ rule, label, weight }); };

  add('priority',   todo.priority || 'none',  PRIORITY_SCORE[todo.priority] || 0);
  add('money-tier', moneyTier,                MONEY_TIER_SCORE[moneyTier]   || 0);
  add('effort',     todo.effort || 'unknown', EFFORT_SCORE[todo.effort || todo.timeEstimate] || 0);
  if (STATUS_SCORE[todo.status]) add('status', todo.status, STATUS_SCORE[todo.status]);

  const dueDate   = parseDueDate(todo, now);
  const dueInDays = daysUntil(dueDate, now);
  const [dateWeight, dateLabel] = dueScore(dueInDays);
  if (dateWeight) add('due-date', dateLabel, dateWeight);

  const text = todoText(todo);
  for (const [label, weight, patterns] of SIGNALS) {
    if (patterns.some(p => p.test(text))) add('signal', label, weight);
  }

  if (todo.blockedBy?.length)    add('blocked',      `blocked by ${todo.blockedBy.join(', ')}`, -25);
  if (todo.benefitsFrom?.length) add('benefits-from', `${todo.benefitsFrom.length} linked todo(s)`, Math.min(9, todo.benefitsFrom.length * 3));

  return {
    ...todo,
    category,
    moneyTier,
    dueDate:    formatDate(dueDate),
    dueInDays,
    isOverdue:  dueInDays !== null && dueInDays < 0,
    lowContext:  detectLowContext(todo),
    aiAssist:   detectAiAssist(todo),
    score,
    scoreDetails: details.sort((a, b) => b.weight - a.weight),
    nextAction:  nextAction(todo),
  };
}

function reason(todo) {
  return todo.scoreDetails
    .filter(d => d.weight > 0)
    .slice(0, 3)
    .map(d => `${d.label} (+${d.weight})`)
    .join('; ');
}

// ── Context builder ───────────────────────────────────────────────────────────
function buildPriorityContext(todos, options = {}) {
  const now           = options.now           || new Date();
  const limit         = Number(options.limit  || 12);
  const timeAvailable = options.timeAvailable || null;
  const userContext   = options.userContext   || null;

  const open   = (todos || []).filter(t => t && !t.deleted && t.status !== 'completed');
  const ranked = open
    .map(t => scoreTodo(t, { now }))
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));

  const groups = ranked.reduce((acc, t) => {
    const key = t.category.sub ? `${t.category.main} / ${t.category.sub}` : t.category.main;
    (acc[key] ||= []).push({ id: t.id, title: t.title, score: t.score, moneyTier: t.moneyTier });
    return acc;
  }, {});

  const overdueTodos    = ranked.filter(t => t.isOverdue);
  const lowContextTodos = ranked.filter(t => t.lowContext);

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt:   now.toISOString(),
    goal:          options.goal || 'Choose the next highest-value todo, ranked list, action plan, and category groups.',
    sessionContext: {
      timeAvailable,
      userContext,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      timeOfDay: now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening',
    },
    rules: [
      'Ignore completed and deleted todos.',
      'Money Now tasks (active RE flip and dispo) rank highest by default.',
      'Urgency and hard deadlines can elevate Money Soon tasks above Money Now tasks.',
      'When time is limited (short window or heavy work day), maximize bang-for-buck: prefer quick tasks that directly move money or fulfill commitments.',
      'AI-assist tasks (aiAssist: true) can often be batched and completed faster than their effort estimate suggests.',
      'Penalize blocked work until the blocker is cleared.',
      'Flag overdue todos for acknowledgment — they may be done, moot, or need rescheduling.',
    ],
    flags: {
      overdueTodos:    overdueTodos.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, dueInDays: t.dueInDays })),
      lowContextTodos: lowContextTodos.map(t => ({ id: t.id, title: t.title })),
    },
    summary: {
      openCount:       open.length,
      categoryCount:   Object.keys(groups).length,
      overdueCount:    overdueTodos.length,
      lowContextCount: lowContextTodos.length,
    },
    rankedCandidates: ranked.slice(0, limit).map(t => ({
      id:           t.id,
      title:        t.title,
      status:       t.status,
      priority:     t.priority,
      effort:       t.effort,
      mainCategory: t.category.main,
      subCategory:  t.category.sub,
      moneyTier:    t.moneyTier,
      score:        t.score,
      dueDate:      t.dueDate,
      isOverdue:    t.isOverdue,
      lowContext:   t.lowContext,
      aiAssist:     t.aiAssist,
      reasonSeed:   reason(t),
      nextAction:   t.nextAction,
      description:  t.description  || '',
      notes:        t.notes        || '',
      blockedBy:    t.blockedBy    || [],
      benefitsFrom: t.benefitsFrom || [],
    })),
    categoryGroups: groups,
  };
}

// ── Rules-only recommendation ─────────────────────────────────────────────────
function buildRulesRecommendation(context) {
  const catLabel = t => `${t.mainCategory}${t.subCategory ? ' / ' + t.subCategory : ''}`;

  const ranked = context.rankedCandidates.map((t, i) => ({
    rank:         i + 1,
    id:           t.id,
    title:        t.title,
    mainCategory: t.mainCategory,
    subCategory:  t.subCategory,
    moneyTier:    t.moneyTier,
    score:        t.score,
    reason:       `Do "${t.title}" first because ${t.reasonSeed || 'it is the highest-scored open item'}.`,
    nextAction:   t.nextAction,
    aiAssist:     t.aiAssist,
    isOverdue:    t.isOverdue,
    lowContext:   t.lowContext,
  }));

  return {
    nextTodo:     ranked[0] || null,
    rankedTodos:  ranked,
    actionPlan: {
      today:    ranked.slice(0, 3).map(t => `${t.title}: ${t.nextAction}`),
      thisWeek: ranked.slice(3, 8).map(t => `${t.title} (${catLabel(t)})`),
      nextWeek: ranked.slice(8, 12).map(t => `${t.title} (${catLabel(t)})`),
    },
    overdueFlags: context.flags.overdueTodos,
    categories:   Object.entries(context.categoryGroups).map(([cat, items]) => ({
      category: cat,
      todoIds:  items.map(i => i.id),
    })),
  };
}

// ── AI system prompt ──────────────────────────────────────────────────────────
const PRIORITIZE_SYSTEM = `You are a priority engine for Joe, a real estate investor and entrepreneur with four main work areas:

1. Real Estate — active wholesale company (Realvestor Partners / RvP) with a live flip (Dupuy) and three active dispo properties (Capron, Bronze, Peachtree); also involved in SubTo creative finance community.
2. LTD — Leadership Team Development, a business venture currently being built.
3. Personal — includes business ventures (J. Clark client work, Claude website builder side hustle), financial admin, family, and personal development.
4. No traditional W2 — J. Clark is a personal client, not an employer.

Priority philosophy:
- Money Now (active RE flip and dispo) ranks highest by default.
- Money Soon (upcoming opportunities, client deadlines) ranks second.
- Time Sensitive (external commitments with dates) ranks third.
- Research / Development ranks last.

When time is limited (short window or heavy day), maximize bang-for-buck: favor quick tasks that directly move money or fulfill commitments. AI-assist tasks (aiAssist: true) can often be batched and knocked out fast.

Key people: Seth & Oni (RvP partners), Bruce (surplus funds), Adrian (SubTo AI workflow), J. Clark (personal client).
Key properties: Dupuy (active flip), Capron / Bronze / Peachtree (active RvP dispos).

Your output must include:
- One clear next todo with a "Do X first because..." reason and a realistic time box
- A full ranked list with a reason for each item
- An action plan split into Today / This week / Next week
- Category groups showing which todos belong to which life area
- Overdue flags: for each overdue todo suggest whether it should be marked complete, rescheduled, or is still active
- Note any AI-assist tasks that could be batched together for efficiency
- Suggest blockedBy and benefitsFrom relationships you infer from the todo content — the user can accept or reject these

Favor deadlines, revenue, active commitments, and leverage. Do not surface comfortable low-value work without a strong reason.`;

// ── AI tool schema ────────────────────────────────────────────────────────────
const PRIORITIZE_TOOL = {
  name: 'return_todo_prioritization',
  description: 'Return next todo, ranked list, action plan, category groups, overdue flags, and dependency suggestions.',
  input_schema: {
    type: 'object',
    properties: {
      nextTodo: {
        type: 'object',
        properties: {
          id:         { type: 'string' },
          title:      { type: 'string' },
          reason:     { type: 'string' },
          nextAction: { type: 'string' },
          timeBox:    { type: 'string' },
        },
        required: ['id', 'title', 'reason', 'nextAction', 'timeBox'],
      },
      rankedTodos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rank:         { type: 'number' },
            id:           { type: 'string' },
            title:        { type: 'string' },
            mainCategory: { type: 'string' },
            subCategory:  { type: 'string' },
            moneyTier:    { type: 'string' },
            reason:       { type: 'string' },
            nextAction:   { type: 'string' },
            aiAssist:     { type: 'boolean' },
          },
          required: ['rank', 'id', 'title', 'mainCategory', 'reason', 'nextAction'],
        },
      },
      actionPlan: {
        type: 'object',
        properties: {
          today:    { type: 'array', items: { type: 'string' } },
          thisWeek: { type: 'array', items: { type: 'string' } },
          nextWeek: { type: 'array', items: { type: 'string' } },
        },
        required: ['today', 'thisWeek', 'nextWeek'],
      },
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            why:      { type: 'string' },
            todoIds:  { type: 'array', items: { type: 'string' } },
          },
          required: ['category', 'why', 'todoIds'],
        },
      },
      overdueFlags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:              { type: 'string' },
            title:           { type: 'string' },
            suggestedAction: { type: 'string', enum: ['mark-complete', 'reschedule', 'still-active'] },
          },
          required: ['id', 'title', 'suggestedAction'],
        },
      },
      suggestedDependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            todoId:       { type: 'string' },
            blockedBy:    { type: 'array', items: { type: 'string' } },
            benefitsFrom: { type: 'array', items: { type: 'string' } },
          },
          required: ['todoId'],
        },
      },
    },
    required: ['nextTodo', 'rankedTodos', 'actionPlan', 'categories'],
  },
};

module.exports = {
  ENGINE_VERSION,
  buildPriorityContext,
  buildRulesRecommendation,
  inferCategory,
  inferMoneyTier,
  detectAiAssist,
  detectLowContext,
  parseDueDate,
  scoreTodo,
  PRIORITIZE_SYSTEM,
  PRIORITIZE_TOOL,
};
