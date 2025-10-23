import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet settings page", () => {
  test("renders connected status after wizard redirect without triggering RSC fallback", async ({ page }) => {
    const storeId = "store-settings";
    await page.context().addCookies([makeSessionCookie()]);

    const statusResponse = {
      storeId,
      currency: "BTC",
      paymentMethodId: "BTC-CHAIN",
      enabled: true,
      connected: true,
      missingLocalMeta: false,
      metadata: {
        label: "Desk wallet",
        accountKeyPath: "m/84'/0'/0'",
        hasDerivationScheme: true,
        hasMasterFingerprint: true,
      },
      addressPreview: Array.from({ length: 3 }, (_, index) => ({
        address: `bcrt1qdesk${index}`,
        keyPath: `0/${index}`,
        index,
      })),
    };

    let rscTriggered = false;
    await page.route(`**/stores/${storeId}/wallets/btc?_rsc=**`, async (route) => {
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

    await page.goto(`/stores/${storeId}/wallets/btc?connected=1`);

    await expect(page.getByText("Bitcoin wallet settings")).toBeVisible();
    await expect(page.getByText("The wallet was connected successfully")).toBeVisible();
    await expect(page.getByText("Stored securely on BTCPay")).toBeVisible();
    await expect(page.getByText(statusResponse.addressPreview[0].address)).toBeVisible();
    await expect(page.getByText("Missing/expired session"))
      .toHaveCount(0);

    expect(rscTriggered).toBe(false);
  });

  test("shows limited permissions banner when BFF responds with a restricted view", async ({ page }) => {
    const storeId = "store-limited";
    await page.context().addCookies([makeSessionCookie()]);

    const limitedResponse = {
      storeId,
      currency: "BTC",
      paymentMethodId: "BTC-CHAIN",
      enabled: true,
      connected: true,
      missingLocalMeta: false,
      metadata: {
        label: "Desk wallet",
        accountKeyPath: "m/84'/0'/0'",
        hasDerivationScheme: true,
        hasMasterFingerprint: true,
      },
      addressPreview: [],
    };

    let rscTriggered = false;
    await page.route(`**/stores/${storeId}/wallets/btc?_rsc=**`, async (route) => {
      rscTriggered = true;
      await route.fulfill({ status: 404, body: "Unexpected RSC fetch" });
    });

    await page.route(`**/api/stores/${storeId}/wallets/btc`, async (route) => {
      await route.fulfill({
        status: 403,
        body: JSON.stringify(limitedResponse),
        contentType: "application/json",
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc`);

    await expect(page.getByText("The wallet was connected successfully")).toBeVisible();
    await expect(
      page.getByText("Wallet connected. Detailed configuration is hidden because BTCPay returned limited permissions.")
    ).toBeVisible();
    await expect(page.getByText("Address preview is not available.")).toBeVisible();
    await expect(page.getByText("Missing/expired session")).toHaveCount(0);

    expect(rscTriggered).toBe(false);
  });
});
