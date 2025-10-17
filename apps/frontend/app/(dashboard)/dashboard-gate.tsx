"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useStoresQuery, type StoreSummary } from "../../src/hooks/use-stores";
import { persistLastStoreId, readLastStoreId } from "../../src/lib/store-preferences";

const ONBOARDING_PATH = "/onboarding/create-store";

function extractStoreId(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }
  const match = pathname.match(/^\/stores\/([^/]+)(?:\/.*)?$/);
  if (match) {
    return match[1] ?? null;
  }
  return null;
}

function resolvePreferredStoreId(stores: StoreSummary[]): string {
  if (!stores.length) {
    return "";
  }
  const stored = readLastStoreId();
  if (stored && stores.some((store) => store.id === stored)) {
    return stored;
  }
  return stores[0]?.id ?? "";
}

function shouldRedirectToOnboarding(pathname: string): boolean {
  if (!pathname) {
    return true;
  }
  if (pathname.startsWith("/onboarding")) {
    return false;
  }
  return true;
}

function shouldRedirectToStoreDashboard(pathname: string): boolean {
  if (!pathname) {
    return true;
  }
  if (pathname.startsWith(ONBOARDING_PATH)) {
    return true;
  }
  if (pathname === "/" || pathname === "/dashboard" || pathname === "/stores") {
    return true;
  }
  return false;
}

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { data: stores = [], isLoading, isFetching } = useStoresQuery();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const hasStores = stores.length > 0;
  const preferredStoreId = useMemo(() => (hasStores ? resolvePreferredStoreId(stores) : ""), [hasStores, stores]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    if (isLoading || isFetching) {
      return;
    }

    if (!hasStores) {
      if (shouldRedirectToOnboarding(pathname)) {
        router.replace(ONBOARDING_PATH);
      }
      return;
    }

    if (!preferredStoreId) {
      return;
    }

    const currentStoreId = extractStoreId(pathname);
    if (currentStoreId && stores.some((store) => store.id === currentStoreId)) {
      persistLastStoreId(currentStoreId);
      return;
    }

    if (shouldRedirectToStoreDashboard(pathname)) {
      router.replace(`/stores/${preferredStoreId}/dashboard`);
      return;
    }

    if (currentStoreId && !stores.some((store) => store.id === currentStoreId)) {
      router.replace(`/stores/${preferredStoreId}/dashboard`);
    }
  }, [hasHydrated, hasStores, isFetching, isLoading, pathname, preferredStoreId, router, stores]);

  return <>{children}</>;
}
