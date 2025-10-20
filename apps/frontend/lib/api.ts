const rawBaseUrl = process.env.NEXT_PUBLIC_BFF_URL?.replace(/\/$/, '');

export const API_PREFIX = '/api';
export const BFF: string = rawBaseUrl ?? '';

export const AUTH_LOGIN = `${API_PREFIX}/auth/login`;
export const AUTH_LOGOUT = `${API_PREFIX}/auth/logout`;
export const AUTH_REFRESH = `${API_PREFIX}/auth/refresh`;
export const AUTH_CSRF = `${API_PREFIX}/auth/csrf`;
export const AUTH_ME = `${API_PREFIX}/auth/me`;

if (!rawBaseUrl && process.env.NODE_ENV !== 'production') {
  console.warn('NEXT_PUBLIC_BFF_URL is not defined. Falling back to same-origin relative requests.');
}

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

export interface ApiRequestOptions extends RequestInit {
  baseUrl?: string;
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

export function isApiNoContent(response: unknown): response is ApiNoContent {
  return Boolean(
    response &&
      typeof response === 'object' &&
      (response as ApiNoContent).ok === true &&
      (response as ApiNoContent).status === 204 &&
      (response as ApiNoContent).headers instanceof Headers
  );
}

export async function apiGet(path: string, init: ApiRequestOptions = {}): Promise<ApiResponse> {
  return apiFetch(path, { ...init, method: 'GET' });
}

export async function apiPost(
  path: string,
  body?: unknown,
  init: ApiRequestOptions = {}
): Promise<ApiResponse> {
  return apiFetch(path, { ...init, method: 'POST', body: body ?? init.body });
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

export async function apiFetch(path: string, init: ApiRequestOptions = {}): Promise<ApiResponse> {
  const { baseUrl, body, headers, method, ...rest } = init;
  const target = buildUrl(path, baseUrl);

  const requestHeaders = new Headers(headers ?? undefined);
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }

  const httpMethod = normalizeMethod(method ?? (body !== undefined ? 'POST' : 'GET'));

  if (
    body !== undefined &&
    httpMethod !== 'GET' &&
    httpMethod !== 'HEAD' &&
    !requestHeaders.has('Content-Type') &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(typeof Blob !== 'undefined' && body instanceof Blob) &&
    !(typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) &&
    typeof body !== 'string'
  ) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const payload = body !== undefined ? serializeBody(body) : undefined;

  const response = await fetch(target, {
    ...rest,
    method: httpMethod,
    headers: requestHeaders,
    body: payload,
    credentials: 'include',
    mode: 'cors',
  });

  if (response.status === 204) {
    return { ok: true, status: 204, headers: response.headers };
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    const message = extractErrorMessage(response.status, errorBody);
    throw new ApiError(response.status, message, errorBody, response.headers);
  }

  return response;
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
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

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) {
    return body === null ? 'null' : undefined;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof FormData || body instanceof URLSearchParams) {
    return body;
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body;
  }

  if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
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
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (payload && typeof (payload as any).message === 'string') {
    const message = String((payload as any).message).trim();
    if (message) {
      return message;
    }
  }

  return `API ${status}`;
}
