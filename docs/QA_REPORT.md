# PlayLens QA Report

Date: 2026-05-14

## Test Fixtures

Created controlled smoke folders:

- `test-workspaces/uses-playwright`
  - Contains `.playlens/project.json` after init.
  - Contains a local fake `playwright` package so runtime detection can be tested without downloading browsers.
  - `smoke-playwright.cjs` requires `playwright` and emits stdout/stderr.

- `test-workspaces/no-playwright`
  - Contains `.playlens/project.json` after init.
  - Runs a normal Node script with no Playwright import.

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
```

## Verified Capabilities

- PlayLens project scope generation creates `.playlens/project.json`.
- Supervised command runner records process start, pid, stdout, stderr, exit, and session metadata.
- Runtime hook emits `playwright.detected` only when `playwright` is imported.
- Non-Playwright fixture does not emit `playwright.detected`.
- JSON, NDJSON, and Markdown exports work.
- SDK client reaches backend health and sessions endpoints.
- Backend `/api/sessions` seeds demo sessions even when it is the first API call after fresh storage.
- AI is disabled without MiniMax API key.
- AI chat, upload, and action controls are disabled without a key.
- AI settings show pending state until a MiniMax key is configured.
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

## Remaining Risks

- Real browser capture against a real installed Playwright project still needs broader testing with downloaded browsers.
- CDP-level performance, DOM snapshots, screenshots, HAR, and video capture are architecture-ready but not fully implemented.
- MiniMax live transport is shaped but should be tested with a real key before claiming production readiness.
- Screenshot capture in the Codex in-app browser timed out during QA, so visual validation used DOM snapshots and console logs instead.
- The UI is currently desktop-first and should still receive explicit viewport testing once the Browser screenshot path is stable.

