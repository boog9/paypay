"use client";

import { createContext, ReactNode, useContext } from "react";

export interface StoreLayoutContextValue {
  tenantId: string;
  storeId: string;
  btcpayStoreId: string;
  btcpayHost: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
}

const StoreLayoutContext = createContext<StoreLayoutContextValue | null>(null);

export function StoreLayoutProvider({
  value,
  children
}: {
  value: StoreLayoutContextValue;
  children: ReactNode;
}) {
  return <StoreLayoutContext.Provider value={value}>{children}</StoreLayoutContext.Provider>;
}

export function useStoreLayout(): StoreLayoutContextValue {
  const context = useContext(StoreLayoutContext);
  if (!context) {
    throw new Error("useStoreLayout must be used within a StoreLayoutProvider");
  }
  return context;
}
