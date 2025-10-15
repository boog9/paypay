import { expect, test } from "@playwright/test";

const sessionCookie = {
  name: "pp_session",
  value: "test-session",
  domain: "localhost",
  path: "/",
};

test.describe("Dashboard", () => {
  test("displays empty state without duplicate branding", async ({ page }) => {
    await page.context().addCookies([sessionCookie]);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("No stores connected yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /create store/i })).toBeVisible();

    await expect(page.getByText("PayPay Portal", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create account" })).toHaveCount(0);
  });
});
