"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useStoresQuery } from "../../src/hooks/use-stores";

const ONBOARDING_PATH = "/onboarding/create-store";

function extractStoreId(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }
  const match = pathname.match(/^\/stores\/([^/]+)(?:\/.*)?$/);
  return match?.[1] ?? null;
}

function shouldStayOnOnboarding(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  return pathname.startsWith("/onboarding");
}

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: stores = [], isLoading, isFetching } = useStoresQuery();

  useEffect(() => {
    if (isLoading || isFetching) {
      return;
    }

    if (!stores.length) {
      if (!shouldStayOnOnboarding(pathname)) {
        router.replace(ONBOARDING_PATH);
      }
      return;
    }

    const knownStoreIds = stores.map((store) => store.id);
    const activeStoreId = extractStoreId(pathname ?? null);
    const fallbackStoreId = knownStoreIds[0];

    if (!fallbackStoreId) {
      return;
    }

    if (!activeStoreId || !knownStoreIds.includes(activeStoreId)) {
      router.replace(`/stores/${fallbackStoreId}/dashboard`);
    }
  }, [isFetching, isLoading, pathname, router, stores]);

  return <>{children}</>;
}
