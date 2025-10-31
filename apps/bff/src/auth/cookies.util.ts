import type { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { resolveCookieNames } from './cookie-names';

const cookieNames = resolveCookieNames();

export const sharedCookieDomain = resolveCookieDomain();

// Fail-fast policy:
//  - production: throw with a clear message
//  - non-production: emit a single warning
(function enforceSharedCookieDomain() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  const isProd = env === 'production';

  if (!sharedCookieDomain) {
    const msg =
      'Shared cookie domain was not resolved. Set PAYPAY_DOMAIN (e.g. paypay.iddqd.in) and ' +
      'PAYPAY_API_DOMAIN (e.g. api.paypay.iddqd.in). In production this is a hard error.';

    if (isProd) {
      // Throw at import time so app never starts in misconfigured prod.
      throw new Error(msg);
    } else {
      // Single-shot warning in dev/test
      console.warn(`[paypay:bff:cookies] ${msg}`);
    }
  }
})();

const COOKIE_DOMAIN_FALLBACK = '.iddqd.in';

const resolvedCookieDomain = sharedCookieDomain ?? (process.env.NODE_ENV === 'production' ? COOKIE_DOMAIN_FALLBACK : undefined);

const legacyRemovalOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  ...(resolvedCookieDomain ? { domain: resolvedCookieDomain } : {}),
  maxAge: 0,
};

function clearLegacyCookies(res: Response): void {
  for (const name of [...cookieNames.legacyAccess, ...cookieNames.legacyRefresh]) {
    res.cookie(name, '', legacyRemovalOptions);
  }
}

function normalizeHost(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('.')) {
    return trimmed.toLowerCase();
  }
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  const [host] = withoutProtocol.split('/', 1);
  if (!host) {
    return null;
  }
  const [hostname] = host.split(':', 1);
  if (!hostname) {
    return null;
  }
  const lowered = hostname.toLowerCase();
  if (!lowered.includes('.')) {
    return null;
  }
  return lowered;
}

function resolveCookieDomain(): string | undefined {
  const primary = normalizeHost(process.env.PAYPAY_DOMAIN);
  const apiHost = normalizeHost(process.env.PAYPAY_API_DOMAIN);

  if (!primary || !apiHost) {
    return undefined;
  }

  const primarySegments = primary.replace(/^\./, '').split('.');
  const apiSegments = apiHost.replace(/^\./, '').split('.');
  const max = Math.min(primarySegments.length, apiSegments.length);
  const common: string[] = [];

  for (let i = 1; i <= max; i += 1) {
    const a = primarySegments[primarySegments.length - i];
    const b = apiSegments[apiSegments.length - i];
    if (!a || !b || a !== b) {
      break;
    }
    common.unshift(a);
  }

  if (common.length < 2) {
    return undefined;
  }

  return `.${common.join('.')}`;
}

// Session cookies are Secure, HttpOnly and SameSite=Lax so browsers send them alongside
// cross-subdomain requests to the API while protecting them from XSS. When the deployment
// uses shared subdomains (paypay.iddqd.in + api.paypay.iddqd.in) we attach a Domain
// attribute so that SSR requests issued from the frontend origin can forward the cookies.
// In local development (localhost) the attribute is omitted to avoid invalid cookie domains.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  ...(resolvedCookieDomain ? { domain: resolvedCookieDomain } : {}),
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
  clearLegacyCookies(res);
}

export function clearAuthCookies(res: Response): void {
  const expiredOptions: CookieOptions = {
    ...baseCookieOptions,
    maxAge: 0,
  };

  res.cookie(cookieNames.access, '', expiredOptions);
  res.cookie(cookieNames.refresh, '', expiredOptions);
  clearLegacyCookies(res);
}

