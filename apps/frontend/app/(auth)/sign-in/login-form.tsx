'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { AUTH_LOGIN, AUTH_ME, apiFetch, isApiError, isApiNoContent } from '../../../lib/api';
import { getCsrfToken } from '../../../lib/auth';
import { resolveNextDestination } from '../../../lib/navigation';
import { credentialsSchema, type AuthFormState } from '../client-actions';

const initialState: AuthFormState = { status: 'idle' };

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AuthFormState>(initialState);
  const [isSubmitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isSubmittingRef.current) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const emailValue = formData.get('email');
    const passwordValue = formData.get('password');
    const credentials = {
      email: typeof emailValue === 'string' ? emailValue : '',
      password: typeof passwordValue === 'string' ? passwordValue : ''
    };

    const validation = credentialsSchema.safeParse(credentials);
    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      setState({
        status: 'error',
        message: 'Please review the submitted information.',
        fieldErrors
      });
      return;
    }

    setSubmitting(true);
    isSubmittingRef.current = true;
    setState(initialState);

    const submit = async () => {
      try {
        const csrfToken = await getCsrfToken();
        const loginResponse = await apiFetch(AUTH_LOGIN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          body: validation.data,
          cache: 'no-store'
        });

        if (!isApiNoContent(loginResponse)) {
          throw new Error('Unexpected login response.');
        }

        const baseUrl = (process.env.NEXT_PUBLIC_BFF_URL ?? '').replace(/\/$/, '');
        const meUrl = `${baseUrl}${AUTH_ME}`;
        let sessionVerified = false;

        try {
          const meResponse = await fetch(meUrl, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
          });
          sessionVerified = meResponse.ok;
        } catch {
          sessionVerified = false;
        }

        const rawNext = searchParams?.get('next') ?? null;
        const target = resolveNextDestination(rawNext);
        router.replace(target);
        if (!sessionVerified) {
          window.location.replace(target);
        }
      } catch (error) {
        setState(resolveLoginError(error));
        setSubmitting(false);
        isSubmittingRef.current = false;
      }
    };

    void submit();
  };

  return (
    <form method="post" onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-invalid={state.status === 'error' && Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'login-email-error' : undefined}
        />
        {state.fieldErrors?.email && (
          <p id="login-email-error" className="whitespace-pre-line text-sm text-destructive">
            {state.fieldErrors.email.join('\n')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          minLength={12}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-invalid={state.status === 'error' && Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'login-password-error' : undefined}
        />
        {state.fieldErrors?.password && (
          <p id="login-password-error" className="whitespace-pre-line text-sm text-destructive">
            {state.fieldErrors.password.join('\n')}
          </p>
        )}
      </div>
      {state.status === 'error' && !state.fieldErrors && (
        <p className="whitespace-pre-line rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function resolveLoginError(error: unknown): AuthFormState {
  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403) {
      return { status: 'error', message: 'Невірні облікові дані' };
    }

    if (error.status === 429) {
      return { status: 'error', message: 'Забагато спроб, зачекайте хвилину' };
    }

    return { status: 'error', message: 'Помилка мережі. Спробуйте знову.' };
  }

  return { status: 'error', message: 'Помилка мережі. Спробуйте знову.' };
}

