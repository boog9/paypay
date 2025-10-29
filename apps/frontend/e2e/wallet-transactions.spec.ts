import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Wallet transactions page", () => {
  test("renders transactions list with filters, pagination, and CSV export", async ({ page }) => {
    const storeId = "store-wallet";
    await page.context().addCookies([makeSessionCookie()]);

    const baseItems = [
      {
        txId: "incoming-1",
        timestamp: "2024-04-01T12:00:00Z",
        confirmations: 3,
        status: "confirmed",
        direction: "in",
        amount: "0.5",
        fee: "0.00002",
        rateUsd: 32000,
        labels: ["invoice"],
        comment: "Customer paid invoice #1001",
        blockExplorerUrl: "https://mempool.space/testnet/tx/incoming-1",
      },
      {
        txId: "outgoing-1",
        timestamp: "2024-04-01T11:00:00Z",
        confirmations: 0,
        status: "unconfirmed",
        direction: "out",
        amount: "-0.1",
        fee: "0.00001",
        rateUsd: 31500,
        labels: ["payout"],
        comment: null,
        blockExplorerUrl: null,
      },
      {
        txId: "incoming-2",
        timestamp: "2024-04-01T10:30:00Z",
        confirmations: 6,
        status: "confirmed",
        direction: "in",
        amount: "0.25",
        fee: "0.000005",
        rateUsd: 30000,
        labels: ["donation"],
        comment: "Tips jar",
        blockExplorerUrl: null,
      },
    ];

    const transactionsFirstPage = {
      total: 3,
      items: baseItems.slice(0, 2),
    };

    const transactionsSecondPage = {
      total: 3,
      items: baseItems.slice(2),
    };

    const transactionsInvoiceOnly = {
      total: 1,
      items: [baseItems[0]],
    };

    const requestStatuses: number[] = [];
    await page.route(`**/api/stores/${storeId}/wallets/BTC/transactions**`, async (route) => {
      const url = new URL(route.request().url());
      const skip = url.searchParams.get("skip") ?? "0";
      const labels = url.searchParams.getAll("labels");

      let body = transactionsFirstPage;
      if (labels.includes("invoice")) {
        body = transactionsInvoiceOnly;
      } else if (skip === "2") {
        body = transactionsSecondPage;
      }
      const status = requestStatuses.length >= 8 ? 429 : 200;
      requestStatuses.push(status);

      await route.fulfill({
        status,
        body: JSON.stringify(body),
        contentType: "application/json",
      });
    });

    await page.route(`**/api/stores/${storeId}/wallets/BTC/overview`, async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          balance: "0.65000000",
          confirmedBalance: "0.75000000",
          unconfirmedBalance: "-0.10000000",
        }),
        contentType: "application/json",
      });
    });

    await page.goto(`/stores/${storeId}/wallets/btc/transactions?count=2`);

    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("Confirmed balance: 0.75000000 BTC")).toBeVisible();

    await expect(page.getByRole("button", { name: "All" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Incoming" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Outgoing" })).toHaveCount(0);

    const tableRows = page.locator("tbody tr");
    await expect(tableRows).toHaveCount(2);
    await expect(tableRows.nth(0).getByText("+0.50000000 BTC")).toBeVisible();
    await expect(tableRows.nth(1).getByText("-0.10000000 BTC")).toBeVisible();
    await expect(tableRows.nth(1).locator("td").nth(4)).toContainText("0.00001000 BTC");
    await expect(tableRows.nth(0).locator('span[title="Customer paid invoice #1001"]').first()).toBeVisible();
    await expect(tableRows.nth(0).getByText("Incoming")).toBeVisible();

    await page.fill('input[aria-label="Filter by label"]', "invoice");
    const labelResponse = page.waitForResponse((response) => {
      return (
        response.url().includes(`/api/stores/${storeId}/wallets/BTC/transactions`) &&
        response.request().url().includes("labels=invoice") &&
        response.status() === 200
      );
    });
    await page.getByRole("button", { name: "Add" }).click();
    await labelResponse;
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first().getByText("+0.50000000 BTC")).toBeVisible();
    await expect(page.getByText("Active labels:")).toBeVisible();

    const clearResponse = page.waitForResponse((response) => {
      return (
        response.url().includes(`/api/stores/${storeId}/wallets/BTC/transactions`) &&
        !response.request().url().includes("labels=") &&
        response.status() === 200
      );
    });
    await page.getByRole("button", { name: "Clear" }).click();
    await clearResponse;
    await expect(tableRows).toHaveCount(2);

    const sortResponse = page.waitForResponse((response) => {
      return (
        response.url().includes(`/api/stores/${storeId}/wallets/BTC/transactions`) &&
        response.request().url().includes("order=asc") &&
        response.status() === 200
      );
    });
    await page.getByRole("button", { name: /Sort/ }).click();
    await sortResponse;

    const nextResponse = page.waitForResponse((response) => {
      return (
        response.url().includes(`/api/stores/${storeId}/wallets/BTC/transactions`) &&
        response.request().url().includes("skip=2") &&
        response.status() === 200
      );
    });
    const nextButton = page.getByRole("button", { name: "Next" });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await nextResponse;
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first().getByText("+0.25000000 BTC")).toBeVisible();

    const previousResponse = page.waitForResponse((response) => {
      return (
        response.url().includes(`/api/stores/${storeId}/wallets/BTC/transactions`) &&
        !response.request().url().includes("skip=2") &&
        response.status() === 200
      );
    });
    await page.getByRole("button", { name: "Previous" }).click();
    await previousResponse;
    await expect(tableRows).toHaveCount(2);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export transactions" }).click();
    await page.getByRole("menuitem", { name: "CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/btc-transactions-.*\.csv$/);

    expect(requestStatuses).not.toContain(429);
  });
});
