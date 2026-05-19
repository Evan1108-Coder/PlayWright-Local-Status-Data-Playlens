# PlayLens Troubleshooting Guide

## Common Issues

### Backend won't start / port already in use

**Symptom:** `Error: listen EADDRINUSE :::4174`

**Solution:**
```bash
# Find the process using port 4174
lsof -i :4174
# Kill it
kill -9 <PID>
# Restart
npm run api
```

### Frontend shows blank page

**Symptom:** White screen or no content rendered

**Possible causes:**
1. Backend is not running — start it with `npm run api`
2. Missing dependencies — run `npm install`
3. Build errors — run `npm run lint` to check for TypeScript errors

### AI features show "AI disabled" or "missing MiniMax key"

**Symptom:** Sidebar system card shows "AI disabled" and "missing MiniMax key"

**Solution:**
1. Create a `.env` file in the project root (see `ENV.md`)
2. Add your MiniMax API key: `MINIMAX_API_KEY=your_key_here`
3. Restart the backend server and Vite dev server

### API health check fails (Data page shows "offline")

**Symptom:** Data Access page shows API status as "offline"

**Solution:**
1. Ensure the backend server is running: `npm run api`
2. Check the API base URL in `.env`: `VITE_PLAYLENS_API_BASE=http://127.0.0.1:4174`
3. Test manually: `curl http://127.0.0.1:4174/api/health`

### TypeScript errors after pulling changes

**Symptom:** `npm run lint` shows type errors

**Solution:**
```bash
# Clean install
rm -rf node_modules
npm install
npm run lint
```

### Tests fail with module resolution errors

**Symptom:** `tsx` can't resolve imports

**Solution:**
```bash
# Ensure tsx is installed
npm install
# Run tests individually to isolate the issue
npm run test:logic
npm run test:agent
npm run test:minimax
npm run test:recorder
```

### Recordings not being created

**Symptom:** Running `playlens run` doesn't create session files

**Possible causes:**
1. The project hasn't been initialized — run `npm run playlens -- init /path/to/project`
2. The runtime hook didn't detect Playwright — ensure your script imports `playwright` or `@playwright/test`
3. Storage directory permissions — check that `.playlens-data/` is writable

### Export produces empty output

**Symptom:** `playlens export` returns empty or minimal data

**Solution:**
1. Ensure sessions exist in `.playlens-data/sessions/`
2. Try a different format: `--format json`, `--format ndjson`, or `--format markdown`
3. Run `npm run playlens -- doctor` to check system health

### Dashboard feels cramped on smaller screens

**Symptom:** Dense dashboard panels feel cramped or require extra scrolling on smaller screens

**Note:** The dashboard supports responsive layouts down to mobile-width screens, but the investigation view is still information-dense. Use a wider desktop window for the most comfortable timeline, replay, metrics, and graph layout.

### Settings changes not persisting after refresh

**Note:** Settings are saved to the backend via `POST /api/state`. If changes are lost on refresh, ensure the backend server is running (`npm run api`) and that storage directories are writable. Check `npm run playlens -- doctor` for diagnostics.

## Getting Help

1. Check the `README.md` for an overview of the project
2. Check `SETUP.md` for installation instructions
3. Check `ENV.md` for environment variable configuration
4. Run `npm run playlens -- doctor` for system diagnostics
5. Open an issue on GitHub: https://github.com/Evan1108-Coder/PlayWright-Local-Status-Data-Playlens/issues
