"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useStoresQuery } from "../../src/hooks/use-stores";

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

    const currentStoreId = extractStoreId(pathname);
    const knownStoreIds = stores.map((store) => store.id);
    const fallbackStoreId = knownStoreIds[0];
    if (!fallbackStoreId) {
      return;
    }

    if (currentStoreId && !knownStoreIds.includes(currentStoreId)) {
      router.replace(`/stores/${fallbackStoreId}/dashboard`);
      return;
    }

    if (!currentStoreId && shouldRedirectToStoreDashboard(pathname)) {
      router.replace(`/stores/${fallbackStoreId}/dashboard`);
    }
  }, [hasHydrated, hasStores, isFetching, isLoading, pathname, router, stores]);

  return <>{children}</>;
}
