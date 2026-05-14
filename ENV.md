# PlayLens Environment Variables

PlayLens uses environment variables for configuration. Create a `.env` file in the project root to customize behavior.

## Quick Start

```bash
cp .env.example .env
```

## Server-Side Variables

These are used by the backend server (`npm run api`) and the recorder system. They are **never** exposed to the browser.

### `MINIMAX_API_KEY`

**Required for AI features.** Your MiniMax API key. The key stays on the server and AI requests are proxied through `/api/ai/complete`.

- **Type:** String
- **Default:** (none — AI features are disabled)
- **Example:** `MINIMAX_API_KEY=sk-api-xxxxx`
- **Where to get it:** https://www.minimax.io/ — sign up and generate an API key
- **Security:** This key is NOT prefixed with `VITE_` so it is never embedded in the frontend build.

### `MINIMAX_MODEL`

The MiniMax model to use for AI conversations and analysis.

- **Type:** String
- **Default:** `minimax-text-01`

### `MINIMAX_BASE_URL`

Override the MiniMax API base URL.

- **Type:** URL
- **Default:** `https://api.minimax.io/v1`

### `PLAYLENS_PORT`

Port for the backend API server.

- **Type:** Number
- **Default:** `4174`

### `PLAYLENS_STORAGE_DIR`

Override the session storage directory. Used by both the CLI recorder and backend server.

- **Type:** Path
- **Default:** `.playlens/sessions` (project-local)

### `PLAYLENS_DEMO_MODE`

When set to `1`, the backend seeds mock data on first run instead of starting with empty state.

- **Type:** `0` | `1`
- **Default:** (unset — empty state)

## Frontend Variables

These are prefixed with `VITE_` and embedded in the browser bundle. They must **not** contain secrets.

### `VITE_PLAYLENS_API_BASE`

Base URL for the PlayLens backend API server.

- **Type:** URL
- **Default:** `http://127.0.0.1:4174`

### `VITE_PLAYLENS_STORAGE_MODE`

How PlayLens stores session data.

- **Type:** `app-data` | `project-local`
- **Default:** `app-data`
- **Options:**
  - `app-data` — stores data in the central `.playlens/` directory
  - `project-local` — stores data inside each watched project folder

### `VITE_PLAYLENS_AGENT_MODE`

Default AI agent permission mode on startup.

- **Type:** `read-only` | `ask-before-acting` | `trusted-actions` | `full-operator`
- **Default:** `ask-before-acting`

### `VITE_PLAYLENS_AI_ENABLED`

Feature flag that tells the frontend to show AI-related UI. The actual API key stays server-side.

- **Type:** `true` | `false`
- **Default:** (unset — AI UI hidden)

## Example `.env` File

```env
# AI Configuration (server-side only — never exposed to browser)
MINIMAX_API_KEY=sk-api-your-key-here
MINIMAX_MODEL=minimax-text-01

# Frontend feature flag for AI
VITE_PLAYLENS_AI_ENABLED=true

# Backend API
VITE_PLAYLENS_API_BASE=http://127.0.0.1:4174

# Storage
VITE_PLAYLENS_STORAGE_MODE=app-data

# Agent Mode
VITE_PLAYLENS_AGENT_MODE=ask-before-acting
```

## Security Notes

- **Never commit `.env` to version control.** It is already listed in `.gitignore`.
- The MiniMax API key grants access to your MiniMax account and billing. It is proxied through the local backend and never reaches the browser.
- Use `read-only` or `ask-before-acting` agent mode in shared environments.
- The `redactAuthorizationHeaders` setting (enabled by default) removes sensitive headers from recorded network data before sending to AI.
