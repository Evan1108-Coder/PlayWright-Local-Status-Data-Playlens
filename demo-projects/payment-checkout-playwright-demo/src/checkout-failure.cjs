const { chromium } = require("playwright");

async function main() {
  console.log("[demo] Checkout failure run started");
  console.log("[demo] Browser adapter:", chromium.name());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://demo.local/checkout/payment");
  await page.getByRole("button", { name: "Pay now" }).click();

  console.log("[network] POST /api/payment -> 500");
  console.warn("[console] Payment processor retry took 842ms");
  console.error("[issue] Checkout error banner rendered instead of confirmation");
  console.log("[dom] .payment-error-banner text=\"Payment failed. Processor unavailable.\"");

  await browser.close();

  console.error("AssertionError: expected heading \"Order confirmed\" to be visible");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

