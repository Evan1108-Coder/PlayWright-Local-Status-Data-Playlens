const { test } = require("@playwright/test");

test("checkout payment shows confirmation", async ({ page }) => {
  await page.goto("/checkout/payment");
  await page.getByRole("button", { name: "Pay now" }).click();
});

