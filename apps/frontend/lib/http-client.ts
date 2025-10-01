import { getBffApiBaseUrl } from './bff';

const BASE_URL = (() => {
  const value = getBffApiBaseUrl();
  return value.endsWith('/') ? value.slice(0, -1) : value;
})();

function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalized = path.replace(/^\/+/, '');
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return new URL(normalized, base).toString();
}

export async function bffFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const requestInit: RequestInit = {
    ...init,
    headers,
    credentials: 'include'
  };

  const url = toAbsoluteUrl(input);
  return fetch(url, requestInit);
}

export async function fetchCsrf(): Promise<string> {
  const response = await bffFetch('/auth/csrf-token', {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to obtain CSRF token.');
  }

  const headerToken = response.headers.get('x-csrf-token');
  if (headerToken?.trim()) {
    return headerToken.trim();
  }

  let payload: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }

  const csrfToken = payload?.csrfToken;
  if (typeof csrfToken === 'string' && csrfToken.trim().length > 0) {
    return csrfToken;
  }

  throw new Error('CSRF token missing from response.');
}
