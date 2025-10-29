import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet settings page", () => {
  test("renders connected status after wizard redirect without triggering RSC fallback", async ({ page }) => {
    const storeId = "store-settings";
    await page.context().addCookies([makeSessionCookie()]);

    const statusResponse = {
      hasWallet: true,
      enabled: true,
      derivationScheme: "wpkh([10b3bfc0/84'/1'/0']tpubD6NzVbkrYhZ4Xexample/0/*)",
      accountKey: "tpubD6NzVbkrYhZ4XexampleAccountKey",
      masterFingerprint: "10B3BFC0",
      accountKeyPath: "m/84'/1'/0'",
      label: "Treasury wallet",
    } satisfies Record<string, unknown>;

    let rscTriggered = false;
    await page.route(`**/stores/${storeId}/wallets/btc/settings?_rsc=**`, async (route) => {
      rscTriggered = true;
      await route.fulfill({ status: 404, body: "Unexpected RSC fetch" });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc`, async (route) => {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({
        status: 200,
        body: JSON.stringify(statusResponse),
        contentType: "application/json",
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc/settings?connected=1`);

    await expect(page.getByRole("heading", { name: "Bitcoin wallet settings" })).toBeVisible();
    await expect(page.getByText("The wallet was connected successfully")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Derivation scheme" })).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText(statusResponse.derivationScheme)).toBeVisible();
    await expect(page.getByText(statusResponse.accountKey)).toBeVisible();
    await expect(page.getByText("Your session has expired"))
      .toHaveCount(0);

    expect(rscTriggered).toBe(false);
  });

  test("renders limited wallet summary when config is hidden", async ({ page }) => {
    const storeId = "store-limited";
    await page.context().addCookies([makeSessionCookie()]);

    const limitedResponse = {
      hasWallet: true,
      enabled: true,
      derivationScheme: null,
      accountKey: null,
      masterFingerprint: null,
      accountKeyPath: null,
      label: null,
    } satisfies Record<string, unknown>;

    let rscTriggered = false;
    await page.route(`**/stores/${storeId}/wallets/btc/settings?_rsc=**`, async (route) => {
      rscTriggered = true;
      await route.fulfill({ status: 404, body: "Unexpected RSC fetch" });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc`, async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify(limitedResponse),
        contentType: "application/json",
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc/settings`);

    await expect(page.getByRole("heading", { name: "Derivation scheme" })).toBeVisible();
    await expect(page.getByText("Unavailable")).toBeVisible();
    await expect(page.getByText("Hidden by BTCPay")).toBeVisible();
    await expect(page.getByText("Your session has expired")).toHaveCount(0);

    expect(rscTriggered).toBe(false);
  });
});
