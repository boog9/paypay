import { NextResponse, type NextRequest } from "next/server";
import { createSecureHeaders } from "next-secure-headers";

const csrfProtectedRoutes = [/^\/login$/, /^\/signup$/, /^\/organizations\/[^/]+\/settings\/emails$/];

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const bffOrigin = process.env.NEXT_PUBLIC_BFF_URL;
  const connectSrc = ["'self'"];
  if (bffOrigin) {
    connectSrc.push(bffOrigin);
  }

  const secureHeaders = createSecureHeaders({
    forceHTTPSRedirect: [true, { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true }],
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc,
        frameAncestors: ["'none'"]
      }
    }
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

  if (csrfProtectedRoutes.some((pattern) => pattern.test(request.nextUrl.pathname))) {
    const csrfToken = request.cookies.get("pp_csrf");
    if (!csrfToken) {
      const newToken = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      response.cookies.set("pp_csrf", newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/"
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/:path*"]
};
