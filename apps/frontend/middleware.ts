import { NextResponse } from "next/server";
import { createSecureHeaders } from "next-secure-headers";

import { getBffOrigin } from "./lib/bff";

export function middleware() {
  const response = NextResponse.next();
  const connectSrc = [getBffOrigin()];
  const devProxyOrigin = process.env.NEXT_PUBLIC_BFF_DEV_PROXY_ORIGIN;
  if (process.env.NODE_ENV !== "production" && devProxyOrigin) {
    connectSrc.push(devProxyOrigin);
  }
  const filteredConnectSrc = connectSrc.filter((value): value is string => Boolean(value));
  if (filteredConnectSrc.length === 0) {
    filteredConnectSrc.push("'self'");
  }

  const secureHeaders = createSecureHeaders({
    forceHTTPSRedirect: [true, { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true }],
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        // Maintain a single CSP header to avoid accidentally overriding connect-src.
        // https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src
        connectSrc: filteredConnectSrc,
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
