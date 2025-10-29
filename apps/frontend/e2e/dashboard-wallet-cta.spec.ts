import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Dashboard wallet CTA", () => {
  test("hides the wallet setup card when a wallet is connected", async ({ page }) => {
    const storeId = "store-wallet-ready";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**/api/stores/${storeId}/wallets/btc/presence`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWallet: true,
          enabled: true,
          derivationScheme: "wpkh([10b3bfc0/84'/0'/0']xpubExample/0/*)",
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    await expect(page.getByRole("heading", { name: "Store dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Set up a wallet" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to BTC wallet" })).toHaveCount(0);
  });

  test("shows green success card when wallet is connected", async ({ page }) => {
    const storeId = "store-wallet-success";
    await page.context().addCookies([makeSessionCookie()]);

    await page.route(`**/api/stores/${storeId}/wallets/btc/presence`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWallet: true,
          enabled: true,
          derivationScheme: "wpkh([10b3bfc0/84'/0'/0']xpubExample/0/*)",
        }),
      });
    });

    await page.goto(`/stores/${storeId}/dashboard`);

    await expect(page.getByRole("heading", { name: "Wallet set up" })).toBeVisible();
    const openWalletLink = page.getByRole("link", { name: "Open BTC wallet" });
    await expect(openWalletLink).toBeVisible();
    await expect(openWalletLink).toHaveAttribute("href", `/stores/${storeId}/wallets/btc/transactions`);
  });
});
