import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet redirect without connection", () => {
  test("routes to the wizard when no wallet exists", async ({ page }) => {
    const storeId = "store-wallet-missing";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**/api/stores/${storeId}/wallets/btc/presence`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ hasWallet: false, enabled: false, derivationScheme: null }),
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc`);

    await page.waitForURL(`/stores/${storeId}/wallets/btc/wizard`);
    await expect(page.getByRole("heading", { name: "Connect an existing wallet" })).toBeVisible();
  });
});
