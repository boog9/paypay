import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '../../components/ui/button';
import { PortalClient } from './portal-client';

export const metadata: Metadata = {
  title: 'Portal'
};

export default function PortalPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4 space-y-2">
          <h1 className="text-3xl font-semibold">Welcome to the PayPay portal</h1>
          <p className="text-sm text-muted-foreground">
            Review your BTCPay integration status, rotate API keys and connect stores. Store creation is coming soon.
          </p>
        </header>
        <Suspense fallback={null}>
          <PortalClient />
        </Suspense>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Stores</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your BTCPay stores will appear here once provisioning is available. For now you can review your initial access key
            and prepare branding assets.
          </p>
          <Button disabled className="mt-4" variant="outline">
            Create Store (coming soon)
          </Button>
        </article>
        <article className="rounded-xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Need documentation?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Explore the integration guidelines and BTCPay Greenfield API references before connecting production stores.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/docs">Open architecture docs</Link>
          </Button>
        </article>
      </section>
    </div>
  );
}
