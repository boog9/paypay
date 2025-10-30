import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";
import { walletPresencePath } from "../lib/walletPaths";

test.describe("Sidebar wallet navigation", () => {
  test("shows Bitcoin submenu items when a wallet exists", async ({ page }) => {
    const storeId = "store-sidebar-wallet";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          config: { derivationScheme: "wpkh([10b3bfc0/84'/0'/0']xpubExample/0/*)" },
          enabled: true,
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Send" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Receive" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("hides Bitcoin submenu items when the wallet is missing", async ({ page }) => {
    const storeId = "store-sidebar-wallet-missing";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          config: { derivationScheme: null },
          enabled: false,
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByRole("link", { name: "Bitcoin" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Send" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Receive" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });
});
