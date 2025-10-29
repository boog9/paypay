"use client";

import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext<boolean | null>(null);

export function WalletPresenceProvider({ initial, children }: { initial: boolean | null; children: ReactNode }) {
  return <Ctx.Provider value={initial}>{children}</Ctx.Provider>;
}

export function useWalletPresence(): boolean | null {
  return useContext(Ctx);
}
