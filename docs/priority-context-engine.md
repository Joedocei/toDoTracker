# Priority Context Engine

This is the first version of the rules/context workflow behind the remaining todo-card features:

- AI prioritize the next highest-value todo
- Ranked list with reasoning: `Do X first because...`
- Short action plan: `Today`, `This week`, `Next week`
- Todos grouped by inferred category/theme

## Current flow

```text
data/todos.json
  -> lib/priorityEngine.js
  -> deterministic scoring + category inference
  -> rules recommendation fallback
  -> optional Anthropic call via scripts/prioritizeTodos.js --ai
```

## Why this exists

The AI should not receive a raw todo list and guess blindly. The engine first gives it a compact operating context:

1. Open todos only; completed and deleted todos are ignored.
2. Each todo gets a deterministic score from priority, effort, status, due dates, and leverage signals.
3. Todos are grouped into inferred categories such as Real Estate / Flip, Real Estate / Dispo, AI / Automation, W2 / Work, Finance / Admin, etc.
4. The AI receives the ranked candidates, rule set, category groups, and next-action seeds.
5. The AI can override the numeric order, but only with a clear reason.

## Run locally

Rules-only dry run:

```bash
npm run prioritize
```

AI-assisted run:

```bash
ANTHROPIC_API_KEY=your_key npm run prioritize:ai
```

Limit candidates:

```bash
node scripts/prioritizeTodos.js --limit=8
node scripts/prioritizeTodos.js --ai --limit=8
```

Use Railway volume data locally or in production by setting `DATA_FILE`:

```bash
DATA_FILE=/app/data/todos.json npm run prioritize
```

## Next hardening steps

- Add `/api/ai/prioritize` endpoint so the UI can call this workflow.
- Add a modal or panel for `Next todo`, `Ranked list`, `Action plan`, and `Groups`.
- Add user-editable weights so the scoring can reflect current life season.
- Add due-date as a first-class todo field instead of parsing dates from notes.
- Store the last generated recommendation so it can be reviewed later.
