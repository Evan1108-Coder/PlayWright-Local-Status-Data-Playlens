# Changelog

All notable changes to PlayLens will be documented in this file.

## [1.0.0] - 2026-05-19

### Added
- Desktop app for macOS (arm64 + x64) and Windows (x64) via Electron.
- Splash screen with animated loader and PlayLens branding.
- Automatic API + frontend server startup on app launch.
- macOS native title bar integration (hiddenInset style).
- Build system: esbuild server bundling + Vite frontend + electron-builder packaging.
- DESKTOP-APP.md with installation, usage, and troubleshooting guide.

### Fixed
- `playlens init` now detects likely npm scripts from script names and Playwright project context, not only command text.
- Switching pages from the left navigation now closes the top More Actions menu.
- Brand icon corrected from "D" to "P" in sidebar navigation.
- Removed ~200 lines of dead CSS (unused shop/checkout mock, browser-frame, mini-layout, graph-row, request-row classes).
- Troubleshooting guide updated: settings persistence now correctly documents backend API storage.

## [0.1.0] - 2026-05-14

### Added
- React 19 + Vite 6 + TypeScript 5.6 dashboard
- Node HTTP backend API (health, state, sessions, export endpoints)
- CLI with init, run, server, export, doctor, and help commands
- Process supervisor for recording command runs under PlayLens
- Runtime hook (`register.cjs`) that detects Playwright imports
- Playwright reporter shape for test lifecycle events
- Local filesystem storage with `.playlens-data/` directory
- JSON, NDJSON, and Markdown export formatters
- SDK client for programmatic access to PlayLens data
- AI operator panel with MiniMax integration (optional)
- 8 agent tools with risk levels and 4 permission modes
- File upload and ingestion for AI conversations
- Dark theme UI with investigation dashboard, task rail, settings, and data access pages
- Global search across tasks, settings, issues, events, and AI history
- Demo project under `demo-projects/payment-checkout-playwright-demo`
- Unit tests for logic, agent, recorder, and MiniMax adapter
- Full smoke test script
- Documentation: README, SETUP, ENV, TROUBLESHOOTING, CONTRIBUTING, LICENSE

### Fixed
- Browser replay mock now conditional on task having events and a URL
- Memory metric chart displays actual MB values instead of divided-by-10 hack
- Terminal output in bottom drawer is now dynamic and task-scoped
- Search query clears when switching navigation views
- GlobalSearch CSS class names now match stylesheet definitions
- Task card selection uses correct CSS class (`selected` instead of `active`)
- SDK client default port matches server port (4174)
- AI agent "waiting-for-approval" status correctly maps to "paused"
- System metrics in top bar are now filtered by selected task
- Settings system port default corrected to 4174
- Bottom drawer tabs are now interactive buttons with tab switching
- Added missing CSS for settings toolbar, search, and danger zone
