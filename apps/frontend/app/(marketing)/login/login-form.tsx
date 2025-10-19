'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { login } from '../../../lib/auth';
import { isApiError } from '../../../lib/api';
import { credentialsSchema, type AuthFormState } from '../../(auth)/client-actions';

const initialState: AuthFormState = { status: 'idle' };

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState<AuthFormState>(initialState);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
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
    setState(initialState);

    void (async () => {
      try {
        await login(validation.data.email, validation.data.password);
        router.replace('/dashboard');
      } catch (error) {
        setState(resolveLoginError(error));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
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
    if (error.status === 401) {
      return { status: 'error', message: 'Invalid email or password.' };
    }

    if (error.status === 403) {
      return {
        status: 'error',
        message: 'Security session is not initialized. Please reload the page.'
      };
    }

    if (error.status === 422) {
      const payload = isRecord(error.body) ? error.body : undefined;
      const fieldErrors = payload && isRecord(payload['errors'])
        ? normalizeFieldErrors(payload['errors'])
        : undefined;
      const message = extractMessage(payload) ?? 'Please review the submitted information.';
      return { status: 'error', message, fieldErrors };
    }

    const message = error.message || `Login failed with status ${error.status}.`;
    return { status: 'error', message };
  }

  const fallback = error instanceof Error ? error.message : 'Login error';
  return { status: 'error', message: (fallback && fallback.trim()) || 'Login error' };
}

function normalizeFieldErrors(raw: Record<string, unknown>): Record<string, string[]> | undefined {
  const entries = Object.entries(raw)
    .map(([key, value]) => {
      if (isStringArray(value)) {
        const filtered = value
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (filtered.length > 0) {
          return [key, filtered] as const;
        }
        return null;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return [key, [trimmed]] as const;
        }
      }

      return null;
    })
    .filter((entry): entry is readonly [string, string[]] => entry !== null);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function extractMessage(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload['message'];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
