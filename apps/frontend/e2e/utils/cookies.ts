import { ACCESS_TOKEN_COOKIE_NAME } from "../../lib/auth";

export function makeSessionCookie() {
  const base = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3000";
  const { hostname } = new URL(base);

  return {
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: "test-access-token",
    domain: hostname,
    path: "/",
  } as const;
}
