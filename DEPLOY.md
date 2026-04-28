# Deploying to Railway.app (free, ~2 minutes)

Railway auto-detects Node.js and persists files between restarts.

## Steps

1. **Push to GitHub**
   ```
   cd /Users/user/workspace/toDoTracker
   git init
   git add .
   git commit -m "Initial todo tracker"
   ```
   Then create a new repo on github.com and push to it.

2. **Create a Railway project**
   - Go to railway.app and sign in (GitHub login works)
   - Click **New Project → Deploy from GitHub repo**
   - Select your repo
   - Railway auto-detects Node.js and runs `npm start`

3. **Get your URL**
   - In your Railway project, go to **Settings → Networking → Generate Domain**
   - Your app will be live at `https://your-app.up.railway.app`

## Local development

```
cd /Users/user/workspace/toDoTracker
npm install
npm start
# → http://localhost:3000
```

## Data persistence

- Data is stored in `data/todos.json` on the server's disk.
- **Persists across restarts** on Railway.
- If you ever redeploy from scratch (rare), you'd re-enter your todos.
- For guaranteed permanent storage, Railway also supports PostgreSQL — ask if you want that added.
