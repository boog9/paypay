import { ACCESS_TOKEN_COOKIE_NAME } from "../../lib/auth";

export function makeSessionCookie() {
  const base = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3000";
  const url = new URL(base);
  const href = `${url.origin}/`;
  const isHttps = url.protocol === "https:";

  return {
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: "test-access-token",
    url: href,
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: isHttps,
  } as const;
}
