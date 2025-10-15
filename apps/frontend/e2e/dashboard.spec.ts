import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test("displays empty state", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("No stores connected yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /create store/i })).toBeVisible();
  });
});
