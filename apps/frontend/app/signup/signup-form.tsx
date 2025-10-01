'use client';

import { FormEvent, useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signupAction, type AuthFormState } from '../(auth)/client-actions';
import { Button } from '../../components/ui/button';

const initialState: AuthFormState = { status: 'idle' };

export function SignupForm() {
  const router = useRouter();
  const [state, setState] = useState<AuthFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);

      setState(initialState);
      startTransition(async () => {
        const result = await signupAction(formData);
        if (result.status === 'success') {
          formElement.reset();
          setState({
            status: 'success',
            message: result.message ?? 'Account created successfully. You can now sign in.'
          });
          try {
            router.prefetch('/login');
          } catch {
            // Ignore prefetch errors; navigation will still work.
          }
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
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="whitespace-pre-line text-sm text-destructive">
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
          autoComplete="new-password"
          minLength={12}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-invalid={state.status === 'error' && Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
        />
        <p className="text-xs text-muted-foreground">Minimum 12 characters; avoid reusing passwords.</p>
        {state.fieldErrors?.password && (
          <p id="password-error" className="whitespace-pre-line text-sm text-destructive">
            {state.fieldErrors.password.join('\n')}
          </p>
        )}
      </div>
      {state.status === 'error' && !state.fieldErrors && (
        <p className="whitespace-pre-line rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <div className="rounded-md border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
          <p className="whitespace-pre-line">{state.message}</p>
          <p className="mt-2">
            <Link href="/login" className="font-medium underline">
              Go to sign in
            </Link>
          </p>
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  );
}
