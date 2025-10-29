import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Sidebar wallet navigation", () => {
  test("shows Bitcoin submenu items when a wallet exists", async ({ page }) => {
    const storeId = "store-sidebar-wallet";
    await page.context().addCookies([makeSessionCookie()]);

    const walletSummary = {
      hasWallet: true,
      enabled: true,
      derivationScheme: "wpkh([10b3bfc0/84'/0'/0']xpubExample/0/*)",
      accountKey: "xpubExampleAccountKey",
      masterFingerprint: "10B3BFC0",
      accountKeyPath: "m/84'/0'/0'",
      label: "Operations wallet",
    } satisfies Record<string, unknown>;

    await page.route(
      new RegExp(`/api/stores/${storeId}/wallets/btc\\?ts=\\d+`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(walletSummary),
        });
      }
    );

    await page.goto(`/stores/${storeId}/dashboard`);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Send" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Receive" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});
