# PlayLens QA Report

Date: 2026-05-16

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
  - Records a checkout payment failure with `POST /api/payment`, a real `500` response, console errors, DOM before/after text, and real before/after PNG screenshots.
  - The test now passes after proving the visible payment error, so it behaves like a normal project that intentionally validates an error path.

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
curl -s 'http://127.0.0.1:4174/api/artifact?sessionId=<session>&path=<artifact.png>'
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
- Real Playwright folder stores PNG screenshot artifacts and the Replay panel renders the latest real browser screen instead of an empty placeholder.
- Live Playwright demo (`npm run demo:live`) keeps a real Chromium session running, cycles through ResearchPulse topics, emits network/console/action/DOM events, and updates Replay screenshots every few seconds.
- Live dashboard polling uses a compact event window for responsiveness; exports and `.playlens/sessions` remain complete.
- Npm script task names are derived from the script name when command metadata exists, so `npm run demo:live` appears as `Demo Live`.
- Stale `running` manifests are normalized to `stopped` when their PID is no longer alive.
- The task rail shows live tasks plus the most recent historical tasks, with older sessions hidden from the rail instead of deleted.
- Replay tabs switch between honest Replay empty state, DOM, Console, Network, and Logs data.
- Replay no longer duplicates previous/next controls; the top toolbar owns event navigation and the footer owns playback/progress.
- Replay fullscreen expands and exits through both the visible `Exit full screen` button and Escape.
- Graph fullscreen expands and exits through both the visible `Exit full screen` button and Escape.
- Graph/Table tabs switch and show real causal data.
- AI is disabled without MiniMax API key.
- AI chat text remains typeable without a key and shows a clear unavailable message; uploads and mutating agent actions remain disabled.
- AI settings show pending state until a MiniMax key is configured.
- Settings changes save through `/api/state` and sync back from the backend.
- Settings has one Clear AI chat action and one Clear Memory action; the old inert Reset Layout button was removed.
- Clear Memory deletes the current storage folder's sessions, artifacts, exports, and state snapshots after confirmation.
- Global search returns linked settings results and navigates to Settings.
- Data page shows true backend event and issue counts.
- Browser console has no runtime errors during checked pages.
- Blank state uses a non-persisted `Blank` task with zero data; it disappears as soon as real sessions exist.
- AI Agent navigation is disabled while only the `Blank` task exists.

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

13. Replay could not show the browser screen even when the run had real DOM/network data.
   - Fixed by adding screenshot artifact capture in the real Playwright example, an `/api/artifact` route, and Replay/Before/After image rendering.

14. Empty storage had no explicit task semantics.
   - Fixed by deriving a `Blank` task with zero data and disabled AI until a real recording appears.

15. Replay had duplicate previous/next controls and an inert fullscreen icon.
   - Fixed by removing duplicate footer navigation and making fullscreen expand/collapse the replay panel.

16. Settings had duplicate clear-chat controls and an inert Reset Layout button.
   - Fixed by keeping destructive actions in Danger Zone and adding a real Clear Memory action.

17. Old `npm run ...` recordings were displayed as `npm`.
   - Fixed by deriving task names from npm/pnpm/yarn script names and hydrating command metadata.

18. Externally killed recordings could stay visually stuck as `recording`.
   - Fixed by checking stored PIDs and presenting dead processes as `stopped`.

19. Live sessions made the UI sluggish because the dashboard fetched and rendered a growing event stream.
   - Fixed by polling a compact live state window, preventing overlapping polls, and rendering only the latest dashboard event window.

20. Runtime marker output appeared twice: once as structured events and once as giant raw stdout rows.
   - Fixed by compacting marker stdout in live UI state and skipping marker-only terminal rows for future supervised runs.

21. Fullscreen mode had no obvious escape path.
   - Fixed by adding `Exit full screen` controls and Escape-key handling.

## 2026-05-16 Verification Pass

- `npm run lint && npm run build` passed.
- `npm run test` passed.
- `npm run test:smoke` passed.
- Direct Playwright UI pass against `http://127.0.0.1:5173` passed:
  - DOM tab: 113ms.
  - Replay tab: 39ms.
  - Console tab: 64ms.
  - Network tab: 86ms.
  - Logs tab: 171ms.
  - Replay screenshot artifact changed during the live run.
  - Fullscreen exited by button and Escape.
  - Settings opened and `Clear Memory` was visible.
  - Raw `[PlayLens]` marker rows were not visible in the dashboard.

## Remaining Risks

- CDP-level automatic screenshot/HAR/video capture is architecture-ready but not fully implemented. The current real screenshot path is event-linked artifact capture from the example Playwright project.
- MiniMax live transport is shaped but should be tested with a real key before claiming production readiness.
- The UI is currently desktop-first and should still receive explicit viewport testing once the Browser screenshot path is stable.
