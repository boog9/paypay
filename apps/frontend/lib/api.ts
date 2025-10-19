const rawBaseUrl = process.env.NEXT_PUBLIC_BFF_URL?.replace(/\/$/, '');

export const API_PREFIX = '/api';
export const BFF: string = rawBaseUrl ?? '';

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

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export async function apiGet(path: string, init: ApiRequestOptions = {}): Promise<Response> {
  const { baseUrl, ...rest } = init;
  const headers = new Headers(rest.headers ?? undefined);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return apiRequest(path, { ...rest, baseUrl, method: 'GET', headers });
}

export async function apiPost(path: string, body?: unknown, init: ApiRequestOptions = {}): Promise<Response> {
  const { baseUrl, ...rest } = init;
  const headers = new Headers(rest.headers ?? undefined);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (body !== undefined && !headers.has('Content-Type') && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const payload = serializeBody(body);

  return apiRequest(path, {
    ...rest,
    baseUrl,
    method: 'POST',
    headers,
    body: payload
  });
}

export async function api<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  const { baseUrl, ...rest } = init;
  const headers = new Headers(rest.headers ?? undefined);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await apiRequest(path, { ...rest, baseUrl, headers });

  if ([204, 205, 304].includes(response.status)) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

async function apiRequest(path: string, init: ApiRequestOptions = {}): Promise<Response> {
  const { baseUrl, ...rest } = init;
  const headers = new Headers(rest.headers ?? undefined);
  const target = buildUrl(path, baseUrl);

  const response = await fetch(target, {
    ...rest,
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    const message = extractErrorMessage(response.status, body);
    throw new ApiError(response.status, message, body, response.headers);
  }

  return response;
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
