import { apiBaseUrl as sdkApiBaseUrl, apiFetch as sdkApiFetch, type ApiFetchInit } from '@paypay/sdk';

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

export const API_PREFIX = '/api';
export const BFF: string = sdkApiBaseUrl();
export const apiBaseUrl = sdkApiBaseUrl;
export const apiFetch = sdkApiFetch;

if (!BFF && process.env.NODE_ENV !== 'production') {
  console.warn('NEXT_PUBLIC_BFF_URL is not defined. Falling back to same-origin relative requests.');
}

function ensureApiPath(path: string): string {
  if (!path) {
    throw new Error('API path must be provided.');
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === API_PREFIX || normalized.startsWith(`${API_PREFIX}/`)) {
    return normalized;
  }
  throw new Error(`API requests must use the ${API_PREFIX} prefix. Received: ${path}`);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function api<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const normalizedPath = ensureApiPath(path);
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  const response = await sdkApiFetch(normalizedPath, { ...init, headers });

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
  const data = await api<{ csrfToken: string }>('/api/auth/csrf', {
    method: 'GET',
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
