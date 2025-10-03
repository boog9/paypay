'use client';

import { useEffect } from 'react';
import { Button } from '../../components/ui/button';

export default function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Portal rendering error', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
      <div>
        <h2 className="text-base font-semibold">Unable to load the portal</h2>
        <p className="mt-2">
          An unexpected error occurred while loading your dashboard. Please retry or contact support if the issue persists.
        </p>
      </div>
      <div>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
