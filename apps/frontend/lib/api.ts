const rawBaseUrl = process.env.NEXT_PUBLIC_BFF_URL?.replace(/\/$/, '');

export const API_PREFIX = '/api';
export const BFF: string = rawBaseUrl ?? '';

export const AUTH_LOGIN = `${API_PREFIX}/auth/login`;
export const AUTH_LOGOUT = `${API_PREFIX}/auth/logout`;
export const AUTH_REFRESH = `${API_PREFIX}/auth/refresh`;
export const AUTH_CSRF = `${API_PREFIX}/auth/csrf`;
export const AUTH_ME = `${API_PREFIX}/auth/me`;

const CSRF_HEADER_NAME = 'x-csrf-token';
const REQUEST_ID_HEADERS = ['x-request-id', 'x-requestid'] as const;

let hasScheduledLoginRedirect = false;

if (!rawBaseUrl && process.env.NODE_ENV !== 'production') {
  console.warn('NEXT_PUBLIC_BFF_URL is not defined. Falling back to same-origin relative requests.');
}

let cachedCsrfToken: string | null = null;
let ongoingCsrfFetch: Promise<string | null> | null = null;
let ongoingRefresh: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
    public readonly headers: Headers,
    public readonly requestId: string | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  baseUrl?: string;
  body?: unknown;
}

export interface ApiNoContent {
  ok: true;
  status: 204;
  headers: Headers;
}

export type ApiResponse = Response | ApiNoContent;

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiNoContent(response: Response | ApiNoContent): response is ApiNoContent {
  if (response instanceof Response) {
    return response.status === 204;
  }

  return (
    response?.ok === true &&
    response.status === 204 &&
    response.headers instanceof Headers
  );
}

export async function apiGet(path: string, init: ApiRequestOptions = {}): Promise<ApiResponse> {
  return apiFetch(path, { ...init, method: 'GET' });
}

export function apiPost<T = unknown>(
  path: string,
  body: unknown,
  init: ApiRequestOptions = {}
): Promise<T> {
  return api<T>(path, {
    ...init,
    method: 'POST',
    body,
  });
}

export async function api<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, init);

  if (isApiNoContent(response)) {
    return undefined as T;
  }

  if ([204, 205, 304].includes(response.status)) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

/**
 * All BFF requests must include credentials so the browser can send the __Host- cookies.
 * The backend responds with Access-Control-Allow-Credentials: true and an explicit
 * Access-Control-Allow-Origin header. See https://developer.mozilla.org/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials
 */
export async function apiFetch(path: string, init: ApiRequestOptions = {}): Promise<ApiResponse> {
  const normalizedPath = ensureApiPath(path);
  return executeApiFetch(normalizedPath, init, 0);
}

function shouldAttachCsrf(path: string): boolean {
  return path !== AUTH_CSRF;
}

async function executeApiFetch(
  path: string,
  init: ApiRequestOptions,
  attempt: number
): Promise<ApiResponse> {
  const { baseUrl, body, headers, method, ...rest } = init;
  const target = buildUrl(path, baseUrl);
  const h = new Headers(headers ?? {});
  if (!h.has('Accept')) {
    h.set('Accept', 'application/json');
  }

  const upperMethod = (method ?? 'GET').toUpperCase();
  const finalBody = prepareRequestBody(upperMethod, body, h);

  if (!h.has('X-CSRF-Token') && shouldAttachCsrf(path)) {
    const token = cachedCsrfToken;
    if (token) {
      h.set('X-CSRF-Token', token);
    }
  }

  const response = await fetch(target, {
    method: upperMethod,
    credentials: 'include',
    mode: 'cors',
    headers: h,
    body: finalBody,
    ...rest
  });

  rememberCsrfTokenFromHeaders(response.headers);

  if (response.status === 401 && attempt === 0 && path !== AUTH_REFRESH) {
    const refreshed = await attemptAuthRefresh(baseUrl);
    if (refreshed) {
      return executeApiFetch(path, init, attempt + 1);
    }
  }

  if (response.status === 204) {
    return { ok: true, status: 204, headers: response.headers };
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    if (response.status === 401 && shouldHandleUnauthorized(path)) {
      resetCachedCsrfToken();
      scheduleLoginRedirect();
    }

    let message = extractErrorMessage(response.status, errorBody);
    if (response.status === 401 && !shouldHandleUnauthorized(path)) {
      message = resolveBodyMessage(errorBody) ?? message;
    }

    const requestId = extractRequestIdFromHeaders(response.headers);
    throw new ApiError(response.status, message, errorBody, response.headers, requestId);
  }

  return response;
}

function isBodyInitCandidate(value: unknown): value is BodyInit {
  if (typeof value === 'string') return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true;
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return true;
  if (value instanceof ArrayBuffer) return true;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(value as ArrayBufferView)) return true;
  return false;
}

function prepareRequestBody(method: string, body: unknown, headers: Headers): BodyInit | undefined {
  if (method === 'GET' || method === 'HEAD' || body === undefined) {
    return undefined;
  }

  if (isBodyInitCandidate(body)) {
    return body;
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return JSON.stringify(body);
}

function extractHeaderCaseInsensitive(headers: Headers, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === target) {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function rememberCsrfTokenFromHeaders(headers: Headers): void {
  const token = extractHeaderCaseInsensitive(headers, CSRF_HEADER_NAME);
  if (token) {
    cachedCsrfToken = token;
  }
}

async function fetchCsrfToken(baseUrl?: string): Promise<string | null> {
  if (ongoingCsrfFetch) {
    return ongoingCsrfFetch;
  }

  ongoingCsrfFetch = (async () => {
    try {
      const headers = new Headers({ Accept: 'application/json' });
      const response = await fetch(buildUrl(AUTH_CSRF, baseUrl), {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        headers
      });
      rememberCsrfTokenFromHeaders(response.headers);
      return cachedCsrfToken;
    } catch {
      return cachedCsrfToken;
    }
  })();

  try {
    return await ongoingCsrfFetch;
  } finally {
    ongoingCsrfFetch = null;
  }
}

async function attemptAuthRefresh(baseUrl?: string): Promise<boolean> {
  if (ongoingRefresh) {
    return ongoingRefresh;
  }

  ongoingRefresh = (async () => {
    try {
      const response = await fetch(buildUrl(AUTH_REFRESH, baseUrl), {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        headers: { Accept: 'application/json' }
      });
      rememberCsrfTokenFromHeaders(response.headers);
      if (response.status === 204 || response.ok) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  })();

  try {
    return await ongoingRefresh;
  } finally {
    ongoingRefresh = null;
  }
}

export function getCachedCsrfToken(): string | null {
  return cachedCsrfToken;
}

export function resetCachedCsrfToken(): void {
  cachedCsrfToken = null;
}

function scheduleLoginRedirect(): void {
  if (typeof window === 'undefined' || hasScheduledLoginRedirect) {
    return;
  }
  hasScheduledLoginRedirect = true;
  const destination = new URL('/sign-in', window.location.origin);
  destination.searchParams.set('expired', '1');
  destination.searchParams.set('returnTo', window.location.href);
  window.location.href = destination.toString();
}

function shouldHandleUnauthorized(path: string): boolean {
  return path !== AUTH_LOGIN;
}

function buildUrl(path: string, overrideBase?: string): string {
  const normalizedPath = ensureApiPath(path);
  const baseCandidate = overrideBase ?? rawBaseUrl;
  const base = baseCandidate ? baseCandidate.replace(/\/$/, '') : undefined;

  if (base) {
    return new URL(normalizedPath, base).toString();
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(normalizedPath, window.location.origin).toString();
  }

  return normalizedPath;
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

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

function extractErrorMessage(status: number, payload: unknown): string {
  const bodyMessage = resolveBodyMessage(payload);
  if (status === 401) {
    return 'Сесія завершилась. Увійдіть знову.';
  }
  if (status === 403) {
    return 'Доступ заборонено.';
  }
  if (status === 422) {
    return bodyMessage ?? 'Помилка валідації деривації';
  }
  if (status >= 500) {
    return 'Проблема на сервері';
  }
  if (bodyMessage) {
    return bodyMessage;
  }
  return `API ${status}`;
}

function resolveBodyMessage(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string') {
      const trimmed = message.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    const detail = record.detail;
    if (typeof detail === 'string') {
      const trimmed = detail.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    const errors = record.errors;
    if (Array.isArray(errors)) {
      for (const entry of errors) {
        if (entry && typeof entry === 'object') {
          const messageCandidate = (entry as Record<string, unknown>).message;
          if (typeof messageCandidate === 'string') {
            const trimmed = messageCandidate.trim();
            if (trimmed.length > 0) {
              return trimmed;
            }
          }
        }
      }
    }
  }

  return null;
}

function extractRequestIdFromHeaders(headers: Headers): string | null {
  for (const name of REQUEST_ID_HEADERS) {
    const value = extractHeaderCaseInsensitive(headers, name);
    if (value) {
      return value;
    }
  }
  return null;
}
