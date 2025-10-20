import { expect, test } from "@playwright/test";
import { AUTH_CSRF, AUTH_LOGIN, AUTH_ME } from "../lib/api";

test.describe("Auth API flow", () => {
  test("performs login and session hydration", async ({ request }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BFF_URL ?? process.env.PLAYWRIGHT_BFF_URL;
    const email = process.env.PLAYWRIGHT_AUTH_EMAIL;
    const password = process.env.PLAYWRIGHT_AUTH_PASSWORD;
    const origin = process.env.PLAYWRIGHT_FRONTEND_ORIGIN;

    if (!baseUrl || !email || !password) {
      test.skip("Auth flow environment variables are not configured");
      return;
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");

    const csrfResponse = await request.get(`${normalizedBase}${AUTH_CSRF}`, {
      headers: origin ? { Origin: origin } : undefined,
    });
    expect(csrfResponse.ok()).toBeTruthy();

    const csrfHeader = csrfResponse.headers()["x-csrf-token"];
    let csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (!csrfToken) {
      const csrfJson = await csrfResponse.json();
      csrfToken = csrfJson?.csrfToken;
    }
    expect(csrfToken, "CSRF token should be provided").toBeTruthy();

    const loginHeaders: Record<string, string> = {
      "X-CSRF-Token": csrfToken as string,
    };
    if (origin) {
      loginHeaders["Origin"] = origin;
    }

    const loginResponse = await request.post(`${normalizedBase}${AUTH_LOGIN}`, {
      headers: loginHeaders,
      data: {
        email,
        password,
      },
    });
    expect(loginResponse.status()).toBe(204);

    const meResponse = await request.get(`${normalizedBase}${AUTH_ME}`, {
      headers: origin ? { Origin: origin } : undefined,
    });
    expect(meResponse.status()).toBe(200);

    const meJson = await meResponse.json();
    expect(meJson?.user?.email).toBe(email);
  });
});
