exports.chromium = {
  name() {
    return "chromium-stub-for-playlens-demo";
  },
  async launch(options = {}) {
    console.log("[playwright-stub] chromium.launch", JSON.stringify(options));
    return {
      async newPage() {
        console.log("[playwright-stub] browser.newPage");
        return {
          async goto(url) {
            console.log("[playwright-stub] page.goto", url);
          },
          getByRole(role, options = {}) {
            return {
              async click() {
                console.log("[playwright-stub] locator.click", JSON.stringify({ role, options }));
              }
            };
          }
        };
      },
      async close() {
        console.log("[playwright-stub] browser.close");
      }
    };
  }
};

