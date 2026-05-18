# PlayLens QA Report

Date: 2026-05-18

## 2026-05-18 Local API Final Pass

Commands passed:

```bash
npm run lint
npm run build
npm run test
npm run test:smoke
```

Live checks used a fresh temporary project with `PLAYLENS_STORAGE_DIR` pointed at that project's `.playlens/sessions`.

Verified:

- Empty recording-backed storage returns `0` tasks, sessions, events, issues, metrics, and AI messages.
- Empty dashboard shows only the derived `Blank` task and no demo values.
- `/api/manifest` reports local-only API metadata and 15 endpoint descriptions.
- `npm run demo:fail` creates one real failed task, one session, one issue, one structured `network.response` with status `500`, one `console.message`, and one `dom.snapshot`.
- Dashboard header, issue count, timeline, Network Waterfall, DOM tab, Console tab, and causal graph all reflect the same real data returned by the API.
- `/api/tasks`, `/api/events?kind=network.response`, `/api/issues`, `/api/metrics`, `/api/settings`, and `/api/export` work against the same hydrated state.
- `POST /api/settings` updates a local API setting and the value is visible again through `GET /api/settings`.
- `PlayLensClient` can call `health`, `manifest`, `listTasks`, `listEvents`, `listIssues`, `listMetrics`, and `getSettings`.
- Two concurrent supervised scripts appear as two separate `recording` tasks, then become `passed` tasks after exit.
- Longer supervised runs emit system metrics through `/api/metrics`.
- The new left-nav API page renders local server status, local-only access notes, current data counts, SDK examples, direct HTTP examples, endpoint list, and synced API settings.

Fixed in this pass:

- Recording-backed mode no longer leaks stale app-state tasks into blank or unrelated session folders.
- Recording-backed exports no longer include mock sessions/events from `createInitialAppState`.
- Empty state no longer carries mock AI chat messages.
- Old unrelated project scopes are excluded while a focused `PLAYLENS_STORAGE_DIR` is active.
- The demo's `[network]`, `[console]`, `[issue]`, `[dom]`, `page.goto`, and locator click output is parsed into structured events.
- `/api/sessions` now reports hydrated session issue counts instead of raw manifest-only counts.
- Replay empty-screenshot messaging now describes only the evidence actually captured.

Known remaining limitation:

- The included demo still uses a Playwright stub, so it proves detection and structured data flow but does not produce real browser screenshots/video. Real screenshot capture requires a real Playwright project emitting screenshot artifacts.

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
- Data page session rows open the matching task in the dashboard, so hidden history remains inspectable.
- SDK search reaches the backend `/api/search` route.
- Settings Add Folder creates a real `.playlens/project.json` through the backend project-scope API.
- Supplemental settings are durable, searchable, and persist after reload.
- Recorder-backed UI saves no longer rewrite session manifests or drop command/cwd metadata.
- Supervised runs emit `system.metric` samples and hydrate CPU/memory data into dashboard state.
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

22. Saving UI state in `PLAYLENS_STORAGE_DIR` mode could rewrite raw recorder manifests and drop `command`/`cwd`.
   - Fixed by saving recorder-backed UI preferences separately from append-only session manifests.

23. Renaming real recorded tasks reverted after reload.
   - Fixed by preserving task overrides during session hydration without rewriting the underlying recorder stream.

24. Add Folder only changed UI state and did not create `.playlens/project.json`.
   - Fixed by adding a backend project-scope route that calls the same initializer as the CLI.

25. Supplemental Settings rows were UI-only and reset after reload.
   - Fixed by promoting supplemental groups into the durable settings catalog and action layer.

26. Hidden/older sessions were visible in Data but not openable.
   - Fixed by making Data session rows select the matching task and return to the dashboard.

27. SDK `search()` called a missing `/api/search` route.
   - Fixed by adding the backend search route and smoke coverage.

28. CPU/memory status was advertised but not captured by supervised runs.
   - Fixed by sampling supervised process metrics and hydrating `systemMetrics`.

29. Header URL rendering could throw on relative URLs.
   - Fixed by formatting URLs with a safe base and fallback.

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
- Follow-up regression pass after fixes:
  - Add Folder created `.playlens/project.json` in an isolated temp project.
  - Supplemental setting `Maximum parallel tracked tasks` persisted after reload.
  - `/api/search` returned settings and renamed task results.
  - Renaming a live recorded task persisted after reload and did not mutate the raw session manifest shape.
  - Data session rows opened the selected historical task.
  - Live supervised run emitted hydrated system metrics.
  - Newest live session switched to `stopped` after process termination.

## Remaining Risks

- CDP-level automatic screenshot/HAR/video capture is architecture-ready but not fully implemented. The current real screenshot path is event-linked artifact capture from the example Playwright project.
- MiniMax live transport is shaped but should be tested with a real key before claiming production readiness.
- The UI is currently desktop-first and should still receive explicit viewport testing once the Browser screenshot path is stable.
