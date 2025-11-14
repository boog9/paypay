import { expect, test, type Page } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";
import { walletPresencePath } from "../lib/walletPaths";

async function mockAuthenticatedSession(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "user-sidebar-wallet",
          email: "ada.merchant@example.com",
        },
      }),
    });
  });
}

test.describe("Sidebar wallet navigation", () => {
  test("shows Bitcoin submenu items when a wallet exists", async ({ page }) => {
    const storeId = "store-sidebar-wallet";
    await mockAuthenticatedSession(page);
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWallet: true,
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar).toBeVisible();

    const bitcoinLink = sidebar.getByRole("link", { name: "Bitcoin" });
    await expect(bitcoinLink).toHaveAttribute("href", `/stores/${storeId}/wallets/btc/transactions`);
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Send" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Receive" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("hides Bitcoin submenu items when the wallet is missing", async ({ page }) => {
    const storeId = "store-sidebar-wallet-missing";
    await mockAuthenticatedSession(page);
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**${walletPresencePath(storeId)}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWallet: false,
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar).toBeVisible();

    const bitcoinLink = sidebar.getByRole("link", { name: "Bitcoin" });
    await expect(bitcoinLink).toHaveAttribute("href", `/stores/${storeId}/wallets/btc/wizard`);
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Send" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Receive" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });
});
