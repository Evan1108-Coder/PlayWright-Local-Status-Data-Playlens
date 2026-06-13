# PlayLens Environment Variables

PlayLens uses environment variables for configuration. Create a `.env` file in the project root to customize behavior.

## Quick Start

```bash
cp .env.example .env
```

## Server-Side Variables

These are used by the backend server (`npm run api`) and the recorder system. They are **never** exposed to the browser.

### AI Provider API Keys

Set one or more provider keys to enable AI features. The server proxies all AI requests through `/api/ai/complete` so keys are never sent to the browser.

| Variable | Provider | Models Unlocked |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI | gpt-5.5-pro, gpt-5.5, gpt-5.5-mini, gpt-5.4-pro, gpt-5.4-mini, gpt-4o, gpt-4o-mini |
| `ANTHROPIC_API_KEY` | Anthropic | claude-opus-4-7, claude-sonnet-4-7, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-3.5-sonnet |
| `GOOGLE_API_KEY` | Google | gemini-3.1-pro, gemini-3-flash, gemini-2.5-flash-lite |
| `GROQ_API_KEY` | Groq | llama-4-maverick, llama-4-scout, llama-3.3-70b |
| `MINIMAX_API_KEY` | MiniMax | minimax-m3, minimax-m2.5, minimax-m2.7 |
| `MOONSHOT_API_KEY` | Moonshot | kimi-latest, kimi-k2-thinking, kimi-k2-turbo-preview, kimi-k2.5-vision, moonshot-v1-128k |

- **Security:** These keys are NOT prefixed with `VITE_` so they are never embedded in the frontend build.
- **Where to get them:**
  - OpenAI: https://platform.openai.com/api-keys
  - Anthropic: https://console.anthropic.com/
  - Google: https://aistudio.google.com/apikey
  - Groq: https://console.groq.com/keys
  - MiniMax: https://www.minimax.io/
  - Moonshot: https://platform.moonshot.cn/

### `AI_MODEL`

The default AI model used when the frontend doesn't specify one. The provider is auto-detected from the model name prefix.

- **Type:** String
- **Default:** `gpt-4o`
- **Examples:** `claude-sonnet-4-6`, `gemini-3-flash`, `kimi-latest`, `llama-4-scout`

### `MINIMAX_BASE_URL`

Override the MiniMax API base URL (legacy support).

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
- **Dashboard behavior:** When set on the backend, `/api/state` is hydrated from the real recorded sessions in this folder. Task/session/event/issue data comes from that folder, while settings and AI preferences can still be saved locally.
- **Example:** `PLAYLENS_STORAGE_DIR="/Users/me/project/.playlens/sessions" npm run api`

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

Feature flag that tells the frontend to show AI-related UI. The actual API keys stay server-side.

- **Type:** `true` | `false`
- **Default:** (unset — AI UI hidden)

### `VITE_PLAYLENS_AI_MODEL`

Override the default model shown in the frontend (used by the adapter when constructing proxy requests).

- **Type:** String
- **Default:** Uses `AI_MODEL` from server, or `gpt-4o`

## API Endpoints

### `GET /api/ai/status`

Returns AI configuration status:
```json
{
  "configured": true,
  "model": "gpt-4o",
  "provider": "openai",
  "availableProviders": ["openai", "anthropic"]
}
```

### `GET /api/ai/models`

Returns all available models (only those whose API key is configured):
```json
{
  "models": [
    { "id": "gpt-4o", "name": "GPT-4o", "provider": "openai" },
    { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "anthropic" }
  ]
}
```

### `POST /api/ai/complete`

Send a completion request. The server routes to the correct provider:
```json
{
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Analyze this test failure." }
  ],
  "temperature": 0.2,
  "maxTokens": 1200
}
```

## Example `.env` File

```env
# AI Configuration (server-side only — never exposed to browser)
OPENAI_API_KEY=sk-proj-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
AI_MODEL=gpt-4o

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
- API keys grant access to your provider accounts and billing. They are proxied through the local backend and never reach the browser.
- Use `read-only` or `ask-before-acting` agent mode in shared environments.
- The `redactAuthorizationHeaders` setting (enabled by default) removes sensitive headers from recorded network data before sending to AI.
