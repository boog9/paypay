import {
  apiFetch,
  apiGet,
  isApiNoContent,
  AUTH_CSRF,
  AUTH_LOGIN,
  AUTH_LOGOUT,
  AUTH_ME,
  AUTH_REFRESH,
} from './api';

export const ACCESS_TOKEN_COOKIE_NAME = '__Host-pp.access-token';

export async function getCsrfToken(): Promise<string> {
  const response = await apiGet(AUTH_CSRF, { cache: 'no-store' });
  const headers = response.headers;
  const token = headers.get('X-Csrf-Token');

  if (token && token.trim()) {
    return token.trim();
  }

  throw new Error('CSRF token header is missing.');
}

export async function login(email: string, password: string): Promise<MeResponse> {
  const csrf = await getCsrfToken();

  const loginResponse = await apiFetch(AUTH_LOGIN, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf,
    },
    body: { email, password },
    cache: 'no-store',
  });

  if (!isApiNoContent(loginResponse)) {
    throw new Error('Unexpected login response');
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BFF_URL ?? '').replace(/\/$/, '');
  const meUrl = `${baseUrl}${AUTH_ME}`;
  const meResponse = await fetch(meUrl, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!meResponse.ok) {
    throw new Error('Failed to verify authenticated session.');
  }

  const payload: unknown = await meResponse.json();

  if (!isRecord(payload)) {
    throw new Error('Invalid user data: payload is not a record');
  }

  if (!isRecord(payload.user)) {
    throw new Error('Invalid user data: user is not a record');
  }

  if (typeof payload.user.id !== 'string') {
    throw new Error('Invalid user data: user id is not a string');
  }

  if (typeof payload.user.email !== 'string') {
    throw new Error('Invalid user data: user email is not a string');
  }

  return payload as MeResponse;
}

export async function logout(): Promise<void> {
  const csrf = await getCsrfToken();

  const response = await apiFetch(AUTH_LOGOUT, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrf,
    },
    cache: 'no-store',
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
      'X-CSRF-Token': csrf,
    },
    cache: 'no-store',
  });

  if (!isApiNoContent(response)) {
    throw new Error('Unexpected refresh response');
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const response = await fetch((process.env.NEXT_PUBLIC_BFF_URL ?? '').replace(/\/$/, '') + AUTH_ME, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return false;
    }

    const payload: unknown = await response.json().catch(() => null);

    return isMeResponse(payload) && Boolean(payload?.user);
  } catch {
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
