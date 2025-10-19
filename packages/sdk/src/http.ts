const API_PREFIX = '/api';

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function normalizeApiPath(path: string): string {
  if (!path) {
    throw new Error('API path must be a non-empty string.');
  }
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (withLeadingSlash === API_PREFIX || withLeadingSlash.startsWith(`${API_PREFIX}/`)) {
    return withLeadingSlash;
  }
  throw new Error(`API paths must start with "${API_PREFIX}/". Received: ${path}`);
}

export function apiBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_BFF_URL);
}

function resolveTargetUrl(path: string, baseUrlOverride?: string): string {
  const apiPath = normalizeApiPath(path);
  const base = normalizeBaseUrl(baseUrlOverride) || apiBaseUrl();
  if (base) {
    return `${base}${apiPath}`;
  }
  const fallbackOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  return new URL(apiPath, fallbackOrigin).toString();
}

function resolveCredentials(url: URL, init: RequestInit): RequestCredentials | undefined {
  if (init.credentials) {
    return init.credentials;
  }
  if (typeof window === 'undefined') {
    return undefined;
  }
  return url.origin !== window.location.origin ? 'include' : 'same-origin';
}

export interface ApiFetchInit extends RequestInit {
  baseUrl?: string;
}

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { baseUrl, ...rest } = init;
  const targetUrl = resolveTargetUrl(path, baseUrl);
  const resolved = new URL(targetUrl);
  const finalInit: RequestInit = { ...rest };
  const credentials = resolveCredentials(resolved, finalInit);
  if (credentials) {
    finalInit.credentials = credentials;
  }
  return fetch(resolved.toString(), finalInit);
}
