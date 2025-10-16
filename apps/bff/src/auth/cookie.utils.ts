import { isIP } from 'net';

export interface CookieTarget {
  domain?: string;
  isLocal: boolean;
}

function extractHost(candidate?: string): string | undefined {
  if (!candidate) {
    return undefined;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      return url.hostname.toLowerCase();
    } catch {
      // Ignore and fall back to manual parsing below.
    }
  }

  let host = trimmed;
  const firstSpace = host.indexOf(' ');
  if (firstSpace !== -1) {
    host = host.slice(0, firstSpace);
  }

  if (host.startsWith('[')) {
    const closingBracketIndex = host.indexOf(']');
    if (closingBracketIndex !== -1) {
      host = host.slice(1, closingBracketIndex);
    }
  }

  host = host.replace(/^\.+/, '');

  const slashIndex = host.indexOf('/');
  if (slashIndex !== -1) {
    host = host.slice(0, slashIndex);
  }

  const colonIndex = host.indexOf(':');
  if (colonIndex !== -1) {
    host = host.slice(0, colonIndex);
  }

  const normalized = host.trim().toLowerCase();
  return normalized || undefined;
}

export function isLocalHostname(host: string): boolean {
  if (!host) {
    return false;
  }

  const normalized = host.replace(/\[|\]/g, '').toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(normalized)) {
    return true;
  }

  const ipType = isIP(normalized);
  if (ipType === 4) {
    const segments = normalized.split('.').map((segment) => Number.parseInt(segment, 10));
    if (segments.length !== 4 || segments.some((segment) => Number.isNaN(segment))) {
      return false;
    }

    if (segments[0] === 10) {
      return true;
    }
    if (segments[0] === 127) {
      return true;
    }
    if (segments[0] === 192 && segments[1] === 168) {
      return true;
    }
    if (segments[0] === 172 && segments[1] >= 16 && segments[1] <= 31) {
      return true;
    }
    if (segments[0] === 169 && segments[1] === 254) {
      return true;
    }
    if (segments[0] === 0) {
      return true;
    }
  } else if (ipType === 6) {
    if (normalized.startsWith('fd') || normalized.startsWith('fc')) {
      return true;
    }
    if (normalized.startsWith('fe80')) {
      return true;
    }
  }

  return false;
}

export function resolveCookieTarget(params: {
  frontendOrigin?: string;
  fallbackDomain?: string;
}): CookieTarget {
  const candidates: string[] = [];
  if (params.frontendOrigin) {
    candidates.push(params.frontendOrigin);
  }
  if (params.fallbackDomain) {
    candidates.push(params.fallbackDomain);
  }

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (!host) {
      continue;
    }

    if (isLocalHostname(host)) {
      return { domain: undefined, isLocal: true };
    }

    return { domain: host, isLocal: false };
  }

  return { domain: undefined, isLocal: true };
}
