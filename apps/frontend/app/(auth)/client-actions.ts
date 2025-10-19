'use client';

import { z } from 'zod';
import { api, isApiError } from '../../lib/api';
import { getCsrfToken } from '../../lib/auth';

export type AuthFormStateBase = {
  fieldErrors?: Record<string, string[]>;
};

export type AuthFormState =
  | ({ status: 'idle' } & AuthFormStateBase)
  | ({ status: 'error'; message: string } & AuthFormStateBase)
  | ({ status: 'success'; message: string } & AuthFormStateBase);

export type AuthActionResult =
  | {
      status: 'success';
      user?: { id: string; email: string };
      next?: string;
      apiKey?: string;
      message?: string;
    }
  | ({ status: 'error'; message: string } & AuthFormStateBase);

export const credentialsSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters long.')
});

export async function signupAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { status: 'error', message: 'Please review the submitted information.', fieldErrors };
  }

  let csrfToken: string;
  try {
    csrfToken = await getCsrfToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare secure request.';
    return { status: 'error', message };
  }

  try {
    const response = await api<{ next: string; apiKey?: string }>('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Accept: 'application/json'
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store'
    });

    return {
      status: 'success',
      next: typeof response?.next === 'string' ? response.next : '/dashboard',
      apiKey: typeof response?.apiKey === 'string' ? response.apiKey : undefined
    };
  } catch (error) {
    return normalizeApiError(error);
  }
}

function normalizeApiError(error: unknown): AuthActionResult {
  const defaultMessage = 'The request could not be completed. Please try again later.';

  if (isApiError(error)) {
    const body = error.body as any;
    const rawMessage = body?.message ?? body;
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
    return { status: 'error', message: defaultMessage };
  }

  if (error instanceof Error) {
    return { status: 'error', message: error.message || defaultMessage };
  }

  return { status: 'error', message: defaultMessage };
}
