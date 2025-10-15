import { expect, test } from "@playwright/test";

const sessionCookie = {
  name: "pp_session",
  value: "test-session",
  domain: "localhost",
  path: "/",
};

test.describe("Stores", () => {
  test("lists stores with create action", async ({ page }) => {
    await page.context().addCookies([sessionCookie]);
    await page.goto("/stores");

    await expect(page.getByRole("heading", { level: 1, name: "Stores" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create store" })).toBeVisible();

    await expect(page.getByText("Lightning Espresso")).toBeVisible();
    await expect(page.getByText("Noir Bakery")).toBeVisible();
    await expect(page.getByText("Sat Stackers")).toBeVisible();
  });
});
