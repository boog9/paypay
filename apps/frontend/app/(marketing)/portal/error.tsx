'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { JSX } from 'react';
import { Button } from '../../../components/ui/button';

type PortalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PortalError({ error, reset }: PortalErrorProps): JSX.Element {
  useEffect(() => {
    console.error('Portal rendering error', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 text-center shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We could not load the portal right now. Please try again or head back to the dashboard.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
