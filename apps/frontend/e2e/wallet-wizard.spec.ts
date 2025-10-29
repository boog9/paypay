import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet wizard", () => {
  test("connects an existing wallet and redirects to transactions", async ({ page }) => {
    const storeId = "store-wizard";
    await page.context().addCookies([makeSessionCookie()]);

    let walletConnected = false;
    let presenceRequests = 0;
    let presenceAfterConnect = 0;

    await page.route(`**/api/auth/csrf`, async (route) => {
      await route.fulfill({ status: 204, headers: { "X-Csrf-Token": "test-csrf" } });
    });

    const derivationScheme = "wpkh([abcd1234/84'/0'/0']xpub-example/0/*)";
    const previewResponse = {
      storeId,
      currency: "BTC",
      paymentMethodId: "BTC-OnChain",
      addresses: Array.from({ length: 10 }, (_, index) => ({
        address: `bcrt1qexample${index}`,
        keyPath: `0/${index}`,
        index,
      })),
    };

    const saveResponse = {
      storeId,
      currency: "BTC",
      paymentMethodId: "BTC-OnChain",
      enabled: true,
      connected: true,
      missingLocalMeta: false,
      metadata: {
        label: "Imported wallet",
        accountKeyPath: "84'/0'/0'",
        hasDerivationScheme: true,
        hasMasterFingerprint: true,
      },
      addressPreview: previewResponse.addresses,
    };

    await page.route(`**/api/stores/${storeId}/wallets/BTC/transactions**`, async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
        contentType: "application/json",
      });
    });

    await page.route(`**/api/stores/${storeId}/wallets/BTC/overview**`, async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          balance: "0.00000000",
          confirmedBalance: "0.00000000",
          unconfirmedBalance: "0.00000000",
          label: "Imported wallet",
        }),
        contentType: "application/json",
      });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc/presence`, async (route) => {
      presenceRequests += 1;
      if (walletConnected) {
        presenceAfterConnect += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasWallet: walletConnected,
          enabled: walletConnected,
          derivationScheme: walletConnected ? derivationScheme : null,
        }),
      });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc/preview`, async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headerValue("x-csrf-token")).toBe("test-csrf");
      await route.fulfill({
        status: 200,
        body: JSON.stringify(previewResponse),
        contentType: "application/json",
      });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc`, async (route) => {
      if (route.request().method() === "PUT") {
        expect(route.request().headerValue("x-csrf-token")).toBe("test-csrf");
        await route.fulfill({ status: 204 });
        walletConnected = true;
        return;
      }
      await route.fulfill({ status: 200, body: JSON.stringify(saveResponse), contentType: "application/json" });
    });

    await page.goto(`/stores/${storeId}/wallets/btc/wizard`);

    await page.getByRole("button", { name: "Enter extended public key" }).click();

    await page.fill("#derivationScheme", derivationScheme);
    await page.fill("#accountKeyPath", "m/84'/0'/0'");
    await page.getByRole("button", { name: "Preview addresses" }).click();

    await expect(page.getByRole("heading", { name: "Confirm receiving addresses" })).toBeVisible();
    await expect(page.getByText(previewResponse.addresses[0].address)).toBeVisible();
    await expect(page.locator("ol li")).toHaveCount(10);

    await page.getByRole("button", { name: "Confirm and save" }).click();

    await page.waitForURL(`/stores/${storeId}/wallets/btc/transactions?connected=1`);
    await expect(page.getByRole("heading", { name: /Transactions/i })).toBeVisible();
    await expect(page.getByText(/No transactions found/i)).toBeVisible();

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar.getByRole("link", { name: "Transactions" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Send" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Receive" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();

    expect(walletConnected).toBe(true);
    expect(presenceRequests).toBeGreaterThan(0);
    expect(presenceAfterConnect).toBeGreaterThan(0);
  });
});
