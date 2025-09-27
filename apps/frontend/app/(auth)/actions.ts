'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

type AuthFormStateBase = {
  fieldErrors?: Record<string, string[]>;
  message?: string;
};

export type AuthFormState = ({ status: 'idle' } | { status: 'error'; message: string }) & AuthFormStateBase;

const credentialsSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters long.')
});

function getBffBaseUrl() {
  return process.env.BFF_API_URL ?? process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:4000';
}

async function performAuthRequest(
  endpoint: 'signup' | 'login' | 'refresh' | 'logout',
  body: Record<string, unknown>
) {
  const baseUrl = getBffBaseUrl().replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch (error) {
    console.error('Auth request failed', error);
    return { ok: false as const, message: 'The service is temporarily unavailable. Please try again later.' };
  }

  let payload: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    payload = await response.json();
  }

  if (!response.ok) {
    const message = payload?.message ?? 'The request could not be completed. Please try again later.';
    return { ok: false as const, message };
  }

  return { ok: true as const, data: payload };
}

export async function signupAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { status: 'error', message: 'Please review the submitted information.', fieldErrors };
  }

  const result = await performAuthRequest('signup', parsed.data);
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }

  await persistTokens(result.data);
  redirect('/org/stores');
}

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return { status: 'error', message: 'Please review the submitted information.', fieldErrors };
  }

  const result = await performAuthRequest('login', parsed.data);
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }

  await persistTokens(result.data);
  redirect('/org/stores');
}

async function persistTokens(payload: any) {
  if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
    throw new Error('Invalid auth service response payload.');
  }

  const accessMaxAge = 60 * 15; // 15 minutes
  const refreshMaxAge = 60 * 60 * 24 * 30; // 30 days
  const secure = process.env.NODE_ENV === 'production';
  const store = (await cookies()) as unknown as {
    set: (name: string, value: string, options: Record<string, unknown>) => void;
  };

  store.set('pp_access_token', payload.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: accessMaxAge,
    path: '/'
  });

  store.set('pp_refresh_token', payload.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: refreshMaxAge,
    path: '/'
  });

  store.set('pp_user_email', payload.user.email, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: refreshMaxAge,
    path: '/'
  });
}
