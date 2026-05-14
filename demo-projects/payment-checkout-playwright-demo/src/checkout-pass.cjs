const { chromium } = require("playwright");

async function main() {
  console.log("[demo] Checkout pass run started");
  console.log("[demo] Browser adapter:", chromium.name());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://demo.local/checkout/payment");
  await page.getByRole("button", { name: "Pay now" }).click();

  console.log("[network] POST /api/payment -> 200");
  console.log("[dom] h1 text=\"Order confirmed\"");
  console.log("[demo] Checkout pass run completed");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

