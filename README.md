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

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/todos` | Return all todos |
| POST | `/api/todos` | Create a todo |
| PUT | `/api/todos/:id` | Update a todo |
| DELETE | `/api/todos/:id` | Delete a todo |
