import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { AUTH_CSRF, AUTH_LOGIN, AUTH_ME } from "../lib/api";

function headerValue(response: APIResponse, headerName: string): string | undefined {
  const candidate = (response as { headers?: unknown }).headers;
  if (typeof candidate !== "function") {
    return undefined;
  }

  const getHeaders = candidate as (this: APIResponse) => unknown;
  const rawHeaders = getHeaders.call(response);
  if (typeof rawHeaders !== "object" || rawHeaders === null) {
    return undefined;
  }

  const headersRecord = rawHeaders as Record<string, unknown>;
  const normalizedName = headerName.toLowerCase();
  for (const [name, value] of Object.entries(headersRecord)) {
    if (name.toLowerCase() === normalizedName && typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

type MePayload = { user: { id: string; email: string } };
function isMePayload(value: unknown): value is MePayload {
  if (typeof value !== "object" || value === null || !("user" in value)) {
    return false;
  }

  const user = (value as { user?: unknown }).user;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof (user as { email?: unknown }).email === "string" &&
    typeof (user as { id?: unknown }).id === "string"
  );
}

test.describe("Auth API flow", () => {
  test("performs login and session hydration", async ({ request }: { request: APIRequestContext }) => {
    const baseUrl = process.env.NEXT_PUBLIC_BFF_URL ?? process.env.PLAYWRIGHT_BFF_URL;
    const email = process.env.PLAYWRIGHT_AUTH_EMAIL;
    const password = process.env.PLAYWRIGHT_AUTH_PASSWORD;
    const origin = process.env.PLAYWRIGHT_FRONTEND_ORIGIN;

    if (!baseUrl || !email || !password) {
      test.skip(true, "Auth flow environment variables are not configured");
      return;
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");

    const csrfResponse: APIResponse = await request.get(`${normalizedBase}${AUTH_CSRF}`, {
      headers: origin ? { Origin: origin } : undefined,
    });
    expect(csrfResponse.status()).toBe(204);

    const csrfToken = headerValue(csrfResponse, "x-csrf-token");
    expect(typeof csrfToken).toBe("string");
    if (typeof csrfToken !== "string") {
      throw new Error("Missing CSRF token header");
    }

    const loginHeaders: Record<string, string> = {
      "X-CSRF-Token": csrfToken,
    };
    if (origin) {
      loginHeaders["Origin"] = origin;
    }

    const loginResponse: APIResponse = await request.post(`${normalizedBase}${AUTH_LOGIN}`, {
      headers: loginHeaders,
      data: {
        email,
        password,
      },
    });
    expect(loginResponse.status()).toBe(204);

    const setCookieHeaders = loginResponse
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === "set-cookie")
      .map(({ value }) => value);
    expect(
      setCookieHeaders.some((cookie) => cookie.startsWith("__Host-pp.access-token"))
    ).toBeTruthy();
    expect(
      setCookieHeaders.some((cookie) => cookie.startsWith("__Host-pp.refresh-token"))
    ).toBeTruthy();

    const meResponse: APIResponse = await request.get(`${normalizedBase}${AUTH_ME}`, {
      headers: origin ? { Origin: origin } : undefined,
    });
    expect(meResponse.status()).toBe(200);

    const meUnknown: unknown = await meResponse.json();
    if (!isMePayload(meUnknown)) {
      throw new Error("Malformed /me payload");
    }
    expect(meUnknown.user.email).toBe(email);
  });
});
