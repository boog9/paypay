import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";
import { walletPresencePath } from "../lib/walletPaths";

test.describe("Wallet redirect without connection", () => {
  test("routes to the wizard when no wallet exists", async ({ page }) => {
    const storeId = "store-wallet-missing";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ config: { derivationScheme: null }, enabled: false }),
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc`);

    await page.waitForURL(`/stores/${storeId}/wallets/btc/wizard`);
    await expect(page.getByRole("heading", { name: "Connect an existing wallet" })).toBeVisible();
  });

  test("redirects to sign-in when the wallet presence check returns 401", async ({ page }) => {
    const storeId = "store-wallet-session-expired";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" }),
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc`);

    await page.waitForURL("**/sign-in?reason=session-expired");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
