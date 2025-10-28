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
      previewAddresses: Array.from({ length: 3 }, (_, index) => `bcrt1qdesk${index}`),
    };

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

    await expect(page.getByText("Bitcoin wallet settings")).toBeVisible();
    await expect(page.getByText("The wallet was connected successfully")).toBeVisible();
    await expect(page.getByText("Payment method ID")).toBeVisible();
    await expect(page.getByText(statusResponse.previewAddresses[0])).toBeVisible();
    await expect(page.getByText("Your session has expired"))
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
      previewAddresses: [],
    };

    let rscTriggered = false;
    await page.route(`**/stores/${storeId}/wallets/btc/settings?_rsc=**`, async (route) => {
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

    await page.goto(`/stores/${storeId}/wallets/btc/settings`);

    await expect(
      page.getByText("Insufficient permissions to view this wallet. Contact the store administrator to request access.")
    ).toBeVisible();
    await expect(page.getByText("Address preview is not available for this wallet.")).toBeVisible();
    await expect(page.getByText("Your session has expired")).toHaveCount(0);

    expect(rscTriggered).toBe(false);
  });
});
