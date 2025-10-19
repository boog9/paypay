import { api, apiGet, apiPost } from './api';

export const ACCESS_TOKEN_COOKIE_NAME = 'pp.access-token';

export async function getCsrfToken(): Promise<string> {
  const response = await apiGet('/api/auth/csrf', { cache: 'no-store' });

  const fromHeader = response.headers.get('X-Csrf-Token'); // case-insensitive
  if (fromHeader) {
    return fromHeader;
  }

  const payload: unknown = await response.json().catch(() => null);
  if (isRecord(payload)) {
    const fallback = pickTokenString(payload['csrfToken']) ?? pickTokenString(payload['token']);
    if (fallback) {
      return fallback;
    }
  }

  throw new Error('csrf token missing in response');
}

export async function login(email: string, password: string): Promise<MeResponse> {
  const csrf = await getCsrfToken();

  await apiPost(
    '/api/auth/login',
    { email, password },
    {
      headers: {
        'X-CSRF-Token': csrf
      },
      cache: 'no-store'
    }
  );

  const payload = await api<unknown>('/api/auth/me', {
    cache: 'no-store'
  });

  if (isMeResponse(payload)) {
    return payload;
  }

  throw new Error('Unexpected session payload');
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const payload = await api<unknown>('/api/auth/me', {
      cache: 'no-store'
    });

    return isMeResponse(payload) && Boolean(payload.user);
  } catch {
    // treat any failure as unauthenticated to avoid crashing UI/SSR boundaries
    return false;
  }
}

type MeResponse = {
  user?: {
    id: string;
    email: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickTokenString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function isMeResponse(value: unknown): value is MeResponse {
  if (!isRecord(value)) {
    return false;
  }

  const userValue = value['user'];
  if (userValue === undefined) {
    return true;
  }

  if (!isRecord(userValue)) {
    return false;
  }

  const id = userValue['id'];
  const email = userValue['email'];
  return typeof id === 'string' && typeof email === 'string';
}
