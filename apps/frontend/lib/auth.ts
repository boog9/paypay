import {
  api,
  apiFetch,
  apiGet,
  isApiNoContent,
  AUTH_CSRF,
  AUTH_LOGIN,
  AUTH_LOGOUT,
  AUTH_ME,
  AUTH_REFRESH
} from './api';

export const ACCESS_TOKEN_COOKIE_NAME = 'pp.access-token';

export async function getCsrfToken(): Promise<string> {
  const response = await apiGet(AUTH_CSRF, { cache: 'no-store' });

  const fromHeader = response.headers.get('X-Csrf-Token');
  if (fromHeader) {
    return fromHeader;
  }

  if (!isApiNoContent(response)) {
    const payload: unknown = await response.json().catch(() => null);
    if (isRecord(payload)) {
      const fallback = pickTokenString(payload['csrfToken']) ?? pickTokenString(payload['token']);
      if (fallback) {
        return fallback;
      }
    }
  }

  throw new Error('csrf token missing in response');
}

export async function login(email: string, password: string): Promise<MeResponse> {
  const csrf = await getCsrfToken();

  const loginResponse = await apiFetch(AUTH_LOGIN, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf
    },
    body: { email, password },
    cache: 'no-store'
  });

  if (!isApiNoContent(loginResponse)) {
    throw new Error('Unexpected login response');
  }

  const payload = await api<unknown>(AUTH_ME, {
    cache: 'no-store'
  });

  if (isMeResponse(payload)) {
    return payload;
  }

  throw new Error('Unexpected session payload');
}

export async function logout(): Promise<void> {
  const csrf = await getCsrfToken();

  const response = await apiFetch(AUTH_LOGOUT, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf
    },
    cache: 'no-store'
  });

  if (!isApiNoContent(response)) {
    throw new Error('Unexpected logout response');
  }
}

export async function refresh(): Promise<void> {
  const csrf = await getCsrfToken();

  const response = await apiFetch(AUTH_REFRESH, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf
    },
    cache: 'no-store'
  });

  if (!isApiNoContent(response)) {
    throw new Error('Unexpected refresh response');
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const payload = await api<unknown>(AUTH_ME, {
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
