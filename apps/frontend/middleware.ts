import { NextResponse, type NextRequest } from "next/server";
import { createSecureHeaders } from "next-secure-headers";

import { getBffOrigin } from "./lib/bff";
import { ACCESS_TOKEN_COOKIE_NAME } from "./lib/auth";
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/sign-in",
  "/signup",
  "/health",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);
const PUBLIC_PREFIXES = ["/_next/"];

function isPublicRoute(pathname: string): boolean {
  if (!pathname) {
    return true;
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasAccessCookie = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value);

  if (!hasAccessCookie && !isPublicRoute(pathname)) {
    const loginUrl = new URL("/login", request.url);
    const search = request.nextUrl.search ?? "";
    const nextParam = `${pathname}${search}`;
    loginUrl.searchParams.set("next", nextParam || "/");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  const connectSrc = ["'self'", getBffOrigin()];

  const secureHeaders = createSecureHeaders({
    forceHTTPSRedirect: [true, { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true }],
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc,
        frameAncestors: ["'none'"],
      },
    },
  });

  Object.entries(secureHeaders).forEach(([key, value]) => {
    if (!value) {
      return;
    }
    const headerValue = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "object" && "value" in value
        ? String((value as { value: string }).value)
        : String(value);
    response.headers.set(key, headerValue);
  });

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
