'use client';

import { FormEvent, useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, type AuthFormState } from '../(auth)/client-actions';
import { Button } from '../../components/ui/button';

const initialState: AuthFormState = { status: 'idle' };

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState<AuthFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);

      setState(initialState);
      startTransition(async () => {
        const result = await loginAction(formData);
        if (result.status === 'success') {
          router.replace('/org/stores');
          return;
        }

        setState({
          status: 'error',
          message: result.message,
          fieldErrors: result.fieldErrors
        });
      });
    },
    [router]
  );

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
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
