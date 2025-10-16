export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
    public readonly headers: Headers
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const rawBff = process.env.NEXT_PUBLIC_BFF_URL;
const trimmedBff = typeof rawBff === 'string' ? rawBff.trim() : '';

if (!trimmedBff && process.env.NODE_ENV !== 'production') {
  console.warn(
    'NEXT_PUBLIC_BFF_URL is not defined. Falling back to same-origin relative requests.'
  );
}

export const BFF = trimmedBff ? trimmedBff.replace(/\/$/, '') : '';
export const API_PREFIX = '/api';

function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === API_PREFIX || normalized.startsWith(`${API_PREFIX}/`)) {
    return `${BFF}${normalized}`;
  }
  return `${BFF}${API_PREFIX}${normalized}`;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = resolveApiUrl(path);
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const target = new URL(url, origin);
  const isCrossOrigin =
    typeof window !== 'undefined' ? target.origin !== window.location.origin : false;
  const credentials: RequestCredentials = isCrossOrigin
    ? (init.credentials ?? 'include')
    : (init.credentials ?? 'same-origin');

  const response = await fetch(target.toString(), {
    ...init,
    credentials
  });

  const hasBody = ![204, 205, 304].includes(response.status);
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = hasBody && contentType.includes('application/json');
  let payload: unknown = null;

  if (hasBody) {
    if (isJson) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text();
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(response.status, payload);
    throw new ApiError(response.status, message, payload, response.headers);
  }

  if (!hasBody) {
    return undefined as T;
  }

  return (isJson ? payload : (payload as unknown)) as T;
}

export async function fetchCsrfToken(): Promise<string> {
  const data = await api<{ csrfToken: string }>('/auth/csrf', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (typeof data?.csrfToken !== 'string' || data.csrfToken.trim().length === 0) {
    throw new Error('Failed to obtain CSRF token.');
  }
  return data.csrfToken;
}

function extractErrorMessage(status: number, payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }
  if (payload && typeof (payload as any).message === 'string') {
    const msg = String((payload as any).message).trim();
    if (msg) {
      return msg;
    }
  }
  return `API ${status}`;
}
