"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useStoresQuery } from "../../hooks/use-stores";
import { ProvisionedApiKeyBanner } from "./provisioned-api-key-banner";

export function DashboardContent() {
  const { data: stores = [], isLoading } = useStoresQuery();

  const hasStores = stores.length > 0;
  const placeholderCount = useMemo(() => {
    if (isLoading && !hasStores) {
      return 3;
    }
    if (!hasStores) {
      return 0;
    }
    return Math.min(Math.max(stores.length, 3), 6);
  }, [hasStores, isLoading, stores.length]);

  return (
    <div className="flex flex-col gap-6">
      <ProvisionedApiKeyBanner />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor BTCPay activity for your stores. Widgets will appear here once data sources are connected.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4 space-y-2">
          <h2 className="text-xl font-semibold">Welcome to the PayPay portal</h2>
          <p className="text-sm text-muted-foreground">
            Review your BTCPay integration status, connect new stores with merchant API keys and manage credentials from a
            single place.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border bg-background p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Stores</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Use the organization navigation to create stores, register webhooks and review settings linked to your BTCPay
              API keys. Each store uses end-to-end encryption for credential storage.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="https://docs.btcpayserver.org/CreateStore/" target="_blank" rel="noopener noreferrer">
                Review BTCPay guide
              </Link>
            </Button>
          </article>
          <article className="rounded-xl border bg-background p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Need documentation?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Explore the integration guidelines and BTCPay Greenfield API references before connecting production stores.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/docs">Open architecture docs</Link>
            </Button>
          </article>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <PlaceholderCard key={`loading-${index}`} />
          ))}
        </div>
      ) : hasStores ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: placeholderCount }).map((_, index) => (
            <PlaceholderCard key={`store-${index}`} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-sm text-muted-foreground">
          No stores connected yet
        </div>
      )}
    </div>
  );
}

function PlaceholderCard() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm" data-testid="dashboard-placeholder">
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-6 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}
