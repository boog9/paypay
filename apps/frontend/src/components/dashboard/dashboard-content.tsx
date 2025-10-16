"use client";

import { useMemo } from "react";

import { Skeleton } from "../../../components/ui/skeleton";
import { useStoresQuery } from "../../hooks/use-stores";

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
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor BTCPay activity for your stores. Widgets will appear here once data sources are connected.
        </p>
      </header>

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
