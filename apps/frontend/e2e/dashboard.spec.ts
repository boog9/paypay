import { expect, test } from "@playwright/test";

import { makeSessionCookie } from "./utils/cookies";

test.describe("Dashboard", () => {
  test("displays empty state without duplicate branding", async ({ page }) => {
    await page.context().addCookies([makeSessionCookie()]);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("No stores connected yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /create store/i })).toBeVisible();

    await expect(page.getByText("PayPay Portal", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create account" })).toHaveCount(0);

    await expect(page.locator("header [data-testid=\"account-menu\"]")).toHaveCount(0);

    const sidebar = page.locator('aside[aria-label="Application navigation"]');
    await expect(sidebar.getByTestId("account-menu")).toHaveCount(1);

    const accountMenu = sidebar.getByTestId("account-menu");
    await expect(accountMenu).toBeVisible();
    await accountMenu.click();
    await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  });

  test("account menu stays at bottom of mobile drawer", async ({ page }) => {
    await page.context().addCookies([makeSessionCookie()]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer.getByTestId("account-menu")).toBeVisible();
  });
});
