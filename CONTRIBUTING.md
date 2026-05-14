# Contributing to PlayLens

Thank you for your interest in contributing to PlayLens!

## Development Setup

1. Fork and clone the repository
2. Follow the instructions in `SETUP.md`
3. Create a feature branch: `git checkout -b feature/your-feature`

## Code Style

- **TypeScript** — all source files use TypeScript with strict mode
- **React 19** — functional components with hooks
- **CSS** — class-based styles in `src/styles/app.css` (no CSS modules, no inline styles)
- **No comments** unless explaining a non-obvious "why"
- **Naming** — camelCase for variables/functions, PascalCase for components/types

## Project Structure

```
src/
  agent/        — AI agent runtime, tools, MiniMax adapter, file ingestion
  cli/          — CLI commands (init, run, server, export, doctor)
  components/   — React UI components
  data/         — Type definitions and mock data
  exporters/    — JSON, NDJSON, Markdown export formatters
  recorder/     — Process supervisor, Playwright reporter, runtime hook
  sdk/          — Client SDK for consuming PlayLens data
  server/       — Node HTTP backend API
  state/        — Central state management
  storage/      — File-based session storage
  styles/       — CSS stylesheets
  tests/        — Unit tests
scripts/        — Test runners and utilities
playlens-runtime/ — Node.js runtime hook (register.cjs)
demo-projects/  — Example Playwright projects
```

## Testing

Before submitting a PR, ensure all checks pass:

```bash
npm run lint        # TypeScript type-check
npm run test        # All unit tests
npm run test:smoke  # Full smoke test
npm run build       # Production build
```

## Pull Request Process

1. Ensure your branch is up to date with `main`
2. Run all tests and the build
3. Write a clear PR title and description
4. Link any related issues

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser and Node.js version
- Any relevant console errors or screenshots
