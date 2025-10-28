'use client';

import { useEffect } from 'react';
import { Button } from '../../../components/ui/button';

export default function SignupError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Signup page error', error);
  }, [error]);

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
      <p className="font-medium">We could not load the signup form.</p>
      <p className="mt-2">
        An unexpected error occurred. Please retry the operation or contact support if the problem persists.
      </p>
      <Button variant="outline" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
