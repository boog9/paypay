'use client';

import { z } from 'zod';
import { bffFetch, fetchCsrf } from '../../lib/http-client';

export type AuthFormStateBase = {
  fieldErrors?: Record<string, string[]>;
};

export type AuthFormState =
  | ({ status: 'idle' } & AuthFormStateBase)
  | ({ status: 'error'; message: string } & AuthFormStateBase)
  | ({ status: 'success'; message: string } & AuthFormStateBase);

export type AuthActionResult =
  | { status: 'success'; user: { id: string; email: string }; message?: string }
  | ({ status: 'error'; message: string } & AuthFormStateBase);

const credentialsSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters long.')
});

type Credentials = z.infer<typeof credentialsSchema>;

async function performAuthRequest(endpoint: 'register' | 'login', body: Credentials): Promise<AuthActionResult> {
  let csrfToken: string;
  try {
    csrfToken = await fetchCsrf();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare secure request.';
    return { status: 'error', message };
  }

  let response: Response;
  try {
    response = await bffFetch(`/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
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

  const defaultErrorMessage = 'The request could not be completed. Please try again later.';

  if (!response.ok) {
    const rawMessage = payload?.message;
    if (Array.isArray(rawMessage)) {
      const messages = rawMessage
        .flatMap((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0);
      if (messages.length > 0) {
        return { status: 'error', message: messages.join('\n') };
      }
    } else if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
      return { status: 'error', message: rawMessage.trim() };
    }

    return { status: 'error', message: defaultErrorMessage };
  }

  if (endpoint === 'register') {
    const id = payload?.id;
    const email = payload?.email;
    if (typeof id === 'string' && typeof email === 'string') {
      return {
        status: 'success',
        user: { id, email },
        message: `Account ${email} was created successfully. You can now sign in.`
      };
    }

    return { status: 'error', message: 'Invalid auth service response payload.' };
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

  return performAuthRequest('register', parsed.data);
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
