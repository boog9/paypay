import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in'
};

function LoginFormSuspenseFallback() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-border/70 p-6 shadow-sm">
      <span className="sr-only">Loading sign-in form…</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to monitor payments, manage stores, and stay in sync with BTCPay.
        </p>
      </div>
      <Suspense fallback={<LoginFormSuspenseFallback />}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
