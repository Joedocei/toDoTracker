# Todo Tracker

A lightweight personal task tracker with a sidebar-filter layout, rich per-todo fields, and a file-backed JSON store. No database required.

## Features

- Status, effort, time, and tag filters in a persistent left sidebar
- Per-todo fields: description, implementation notes, effort/time justification, dependencies (blocked-by / benefits-from), sub-tasks, and AI opportunities notes
- Inline sub-task checkboxes that save immediately
- Click the status dot on any card to cycle Not Started → In Flight → Completed
- All data stored in `data/todos.json` — edit or back up the file directly

## Running locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The server defaults to port `3000`. Override it with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Project structure

```
.
├── server.js          # Express API + static file server
├── public/
│   └── index.html     # Single-page UI (all HTML/CSS/JS)
└── data/
    └── todos.json     # Persisted todo data (auto-created on first run)
```

## Deploying to Railway

The project is connected to Railway via GitHub. **Every push to `main` triggers an automatic redeploy** — no manual steps needed.

Railway picks up the push and redeploys within ~1 minute. Check the progress in your [Railway dashboard](https://railway.app/dashboard).

> **Data note:** `data/todos.json` persists on Railway's disk across redeploys. A full project reset (rare) would wipe it — export the file first if that matters.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | Return all todos |
| POST | `/api/todos` | Create a todo |
| PUT | `/api/todos/:id` | Update a todo |
| DELETE | `/api/todos/:id` | Delete a todo |
