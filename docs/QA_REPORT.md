# PlayLens QA Report

Date: 2026-05-15

## Test Fixtures

Created controlled smoke folders:

- `test-workspaces/uses-playwright`
  - Contains `.playlens/project.json` after init.
  - Contains a local fake `playwright` package so runtime detection can be tested without downloading browsers.
  - `smoke-playwright.cjs` requires `playwright` and emits stdout/stderr.

- `test-workspaces/no-playwright`
  - Contains `.playlens/project.json` after init.
  - Runs a normal Node script with no Playwright import.

- `/Users/EvanLu/Documents/Codex/2026-05-13/do-you-know-playwright/actual-playwright-accuracy-workspace`
  - Uses real `@playwright/test` and real Chromium.
  - Records a checkout failure with `POST /api/payment`, a real `500` response, console errors, DOM before/after text, and a failing assertion.

## Commands Verified

```bash
npm run lint
npm run test
npm run test:smoke
npm run build
npm run playlens -- doctor
curl -s 'http://127.0.0.1:4174/api/health'
curl -s 'http://127.0.0.1:4174/api/sessions'
curl -s 'http://127.0.0.1:4174/api/export?format=json'
curl -s 'http://127.0.0.1:4174/api/export?format=ndjson'
curl -s 'http://127.0.0.1:4174/api/export?format=markdown'
PLAYLENS_STORAGE_DIR="/path/to/project/.playlens/sessions" npm run api
```

## Verified Capabilities

- PlayLens project scope generation creates `.playlens/project.json`.
- Supervised command runner records process start, pid, stdout, stderr, exit, and session metadata.
- Runtime hook emits `playwright.detected` only when `playwright` is imported.
- Non-Playwright fixture does not emit `playwright.detected`.
- JSON, NDJSON, and Markdown exports work.
- SDK client reaches backend health and sessions endpoints.
- Backend starts from empty state unless `PLAYLENS_DEMO_MODE=1` is explicitly set.
- Backend `/api/state` hydrates tasks, sessions, events, issues, URLs, durations, and viewport data from `PLAYLENS_STORAGE_DIR`.
- Empty session folders render a blank dashboard with a no-active-recording message instead of demo data.
- Real Playwright folder renders latest recorded session first after a fresh run.
- Replay tabs switch between honest Replay empty state, DOM, Console, Network, and Logs data.
- Graph/Table tabs switch and show real causal data.
- AI is disabled without MiniMax API key.
- AI chat text remains typeable without a key and shows a clear unavailable message; uploads and mutating agent actions remain disabled.
- AI settings show pending state until a MiniMax key is configured.
- Settings changes save through `/api/state` and sync back from the backend.
- Global search returns linked settings results and navigates to Settings.
- Data page shows true backend event and issue counts.
- Browser console has no runtime errors during checked pages.

## Bugs Found And Fixed

1. Full smoke script failed inside fixture folders because `tsx` was not on PATH.
   - Fixed by using the root `node_modules/.bin/tsx`.

2. Full smoke script broke when project path contained spaces.
   - Fixed by resolving the root path with `fileURLToPath`.

3. AI unavailable mode still displayed the old sample Payment Failure Summary.
   - Fixed by showing a dedicated AI Unavailable rich message.

4. Data page mapped backend `issueCount` to `artifactCount`.
   - Fixed by displaying issues as issues.

5. Backend seeded session manifests without mock events.
   - Fixed by appending seeded events into fresh session storage.

6. `/api/sessions` returned empty if called before `/api/state` after storage reset.
   - Fixed by initializing state in the sessions route.

7. Data page showed a recorder command that did not match the implemented CLI behavior.
   - Fixed the command examples.

8. Seed mock task summaries disagreed with actual event data.
   - Fixed Auth Smoke and Marketing Candidate event counts.

9. Dashboard initialized from demo data even when the backend was pointed at a real Playwright folder.
   - Fixed by starting the frontend from empty state and polling hydrated backend state.

10. UI panels rendered fake checkout/browser values when no screenshot or no real recording existed.
   - Fixed by replacing fake replay with real evidence panes and explicit empty states.

11. Graph/Table and Replay tabs looked clickable but did not switch content.
   - Fixed by adding local tab state and real table/evidence renderers.

12. AI input was disabled/invisible without an API key.
   - Fixed by allowing typing while keeping responses/actions disabled with a clear warning.

## Remaining Risks

- CDP-level performance, screenshots, HAR, and video capture are architecture-ready but not fully implemented.
- MiniMax live transport is shaped but should be tested with a real key before claiming production readiness.
- The UI is currently desktop-first and should still receive explicit viewport testing once the Browser screenshot path is stable.
