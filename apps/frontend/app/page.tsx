import Link from "next/link";
import { Button } from "../components/ui/button";

export default function LandingPage() {
  return (
    <section className="space-y-12">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="space-y-6">
          <p className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            End-to-end merchant automation
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Operate your BTCPay stores with confidence
          </h1>
          <p className="text-lg text-muted-foreground">
            PayPay orchestrates organizations, stores, wallets and BTCPay workflows through a secure BFF layer. Monitor invoices, payouts and notifications without exposing wallet keys.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/signup">Create organization</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/docs">Architecture docs</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border bg-card p-8 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data flow snapshot
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium">Frontend</dt>
              <dd className="text-muted-foreground">Next.js App Router with selective SSR, hardened with next-secure-headers.</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium">BFF</dt>
              <dd className="text-muted-foreground">NestJS multi-tenant API proxying BTCPay Greenfield via typed SDK.</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium">Core</dt>
              <dd className="text-muted-foreground">BTCPay Server Greenfield API + USDT (TRON) plugin, via authorized API keys.</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="rounded-3xl border bg-muted/40 p-8">
        <h2 className="text-lg font-semibold">Security defaults</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Argon2 password hashing, JWT access/refresh rotation, CSRF-protected forms, rate limiting and webhook signature validation keep merchants secure.
        </p>
      </div>
    </section>
  );
}
