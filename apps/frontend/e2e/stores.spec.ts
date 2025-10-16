import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Stores", () => {
  test("lists stores with create action", async ({ page }) => {
    await page.context().addCookies([makeSessionCookie()]);
    await page.goto("/stores");

    await expect(page.getByRole("heading", { level: 1, name: "Stores" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create store" })).toBeVisible();

    await expect(page.getByText("Lightning Espresso")).toBeVisible();
    await expect(page.getByText("Noir Bakery")).toBeVisible();
    await expect(page.getByText("Sat Stackers")).toBeVisible();
  });
});
