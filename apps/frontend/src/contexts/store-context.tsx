"use client";

import { createContext, useContext, type ReactNode } from "react";

type StoreContextValue = {
  storeId: string | null;
};

const StoreContext = createContext<StoreContextValue>({ storeId: null });

export function StoreProvider({ storeId, children }: { storeId: string | null; children: ReactNode }) {
  return <StoreContext.Provider value={{ storeId }}>{children}</StoreContext.Provider>;
}

export function useStoreContext(): StoreContextValue {
  return useContext(StoreContext);
}
