# Payment Checkout Playwright Demo

This folder is a safe local demo for PlayLens.

It uses a tiny local `playwright` stub package so you can test PlayLens detection without downloading real browsers. The important part is that the demo imports `playwright`, which lets PlayLens prove that the runtime hook detects Playwright usage.

## Scripts

```bash
npm run demo:pass
npm run demo:fail
npm run demo:no-playwright
```

Use PlayLens from the main project root:

```bash
cd "/path/to/playlens"
npm run playlens -- init demo-projects/payment-checkout-playwright-demo
cd demo-projects/payment-checkout-playwright-demo
npm install
../../node_modules/.bin/tsx ../../src/cli/playlens.ts run -- npm run demo:fail
```

Expected behavior:

- `demo:pass` imports Playwright and exits successfully.
- `demo:fail` imports Playwright, prints simulated network/console/DOM evidence, and exits with code `1`.
- `demo:no-playwright` does not import Playwright, so PlayLens should not record a `playwright.detected` event.
