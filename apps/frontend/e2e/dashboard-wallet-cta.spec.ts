import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Dashboard wallet CTA", () => {
  test("hides the wallet setup card when a wallet is connected", async ({ page }) => {
    const storeId = "store-wallet-ready";
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
        expect(route.request().method()).toBe("GET");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(walletSummary),
        });
      }
    );

    await page.goto(`/stores/${storeId}/dashboard`);

    await expect(page.getByRole("heading", { name: "Store dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Set up a wallet" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to BTC wallet" })).toHaveCount(0);
  });

  test("shows green success card when wallet is connected", async ({ page }) => {
    const storeId = "store-wallet-success";
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
        expect(route.request().method()).toBe("GET");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(walletSummary),
        });
      }
    );

    await page.goto(`/stores/${storeId}/dashboard`);

    await expect(page.getByRole("heading", { name: "Wallet set up" })).toBeVisible();
    const openWalletLink = page.getByRole("link", { name: "Open BTC wallet" });
    await expect(openWalletLink).toBeVisible();
    await expect(openWalletLink).toHaveAttribute("href", `/stores/${storeId}/wallets/btc/transactions`);
  });
});
