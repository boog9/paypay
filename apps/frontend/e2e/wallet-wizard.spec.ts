import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet wizard", () => {
  test("connects an existing wallet and redirects to settings", async ({ page }) => {
    const storeId = "store-wizard";
    await page.context().addCookies([makeSessionCookie()]);

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

    await page.waitForURL(`/stores/${storeId}/wallets/btc?connected=1`);
    await expect(page.getByText("Bitcoin wallet settings")).toBeVisible();
    await expect(page.getByText("Imported wallet")).toBeVisible();
    await expect(page.getByText("Stored securely on BTCPay")).toBeVisible();
    await expect(page.getByText("BTCPay wallet documentation")).toBeVisible();
    await expect(page.getByText(previewResponse.addresses[0].address)).toBeVisible();
  });
});
