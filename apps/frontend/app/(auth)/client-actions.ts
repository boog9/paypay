'use client';

import { z } from 'zod';
import { getApiBasePath, getBffApiBaseUrl, getBffOrigin } from '../../lib/bff';

export type AuthFormStateBase = {
  fieldErrors?: Record<string, string[]>;
  message?: string;
};

export type AuthFormState = ({ status: 'idle' } | { status: 'error'; message: string }) & AuthFormStateBase;

export type AuthActionResult =
  | { status: 'success'; user: { id: string; email: string } }
  | ({ status: 'error'; message: string } & AuthFormStateBase);

const credentialsSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters long.')
});

type Credentials = z.infer<typeof credentialsSchema>;

function resolveApiBaseUrl(): string {
  const baseUrl = getBffApiBaseUrl();
  const origin = getBffOrigin();

  if (!origin) {
    const basePath = getApiBasePath();
    return basePath.replace(/\/$/, '');
  }

  return baseUrl.replace(/\/$/, '');
}

async function fetchCsrfToken(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/csrf-token`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Failed to obtain CSRF token.');
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload.csrfToken !== 'string' || payload.csrfToken.length === 0) {
    throw new Error('Received malformed CSRF token response.');
  }

  return payload.csrfToken;
}

async function performAuthRequest(endpoint: 'signup' | 'login', body: Credentials): Promise<AuthActionResult> {
  const baseUrl = resolveApiBaseUrl();

  let csrfToken: string;
  try {
    csrfToken = await fetchCsrfToken(baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare secure request.';
    return { status: 'error', message };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Auth request failed', error);
    return { status: 'error', message: 'The service is temporarily unavailable. Please try again later.' };
  }

  let payload: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const message = payload?.message ?? 'The request could not be completed. Please try again later.';
    return { status: 'error', message };
  }

  if (!payload?.user || typeof payload.user.id !== 'string' || typeof payload.user.email !== 'string') {
    return { status: 'error', message: 'Invalid auth service response payload.' };
  }

  return { status: 'success', user: payload.user };
}

export async function signupAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { status: 'error', message: 'Please review the submitted information.', fieldErrors };
  }

  return performAuthRequest('signup', parsed.data);
}

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { status: 'error', message: 'Please review the submitted information.', fieldErrors };
  }

  return performAuthRequest('login', parsed.data);
}
