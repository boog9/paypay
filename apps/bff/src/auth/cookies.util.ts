import type { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { resolveCookieNames } from './cookie-names';

const cookieNames = resolveCookieNames();

// __Host- cookies are host-only, must be Secure, and cannot set a Domain attribute.
// This ensures the session cookies never leak to sibling subdomains. See:
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookiename
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookies(
  res: Response,
  tokens: { accessJwt: string; refreshJwt: string }
): void {
  const accessOptions: CookieOptions = {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_TTL_S * 1000,
  };
  const refreshOptions: CookieOptions = {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };

  res.cookie(cookieNames.access, tokens.accessJwt, accessOptions);
  res.cookie(cookieNames.refresh, tokens.refreshJwt, refreshOptions);
}

export function clearAuthCookies(res: Response): void {
  const expiredOptions: CookieOptions = {
    ...baseCookieOptions,
    maxAge: 0,
  };

  res.cookie(cookieNames.access, '', expiredOptions);
  res.cookie(cookieNames.refresh, '', expiredOptions);
}
