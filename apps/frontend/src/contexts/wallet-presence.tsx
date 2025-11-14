"use client";

import { createContext, useContext, type ReactNode } from "react";

const WalletPresenceContext = createContext<boolean | null>(null);

export function WalletPresenceProvider({
  initial,
  children,
}: {
  initial: boolean | null;
  children: ReactNode;
}) {
  return <WalletPresenceContext.Provider value={initial}>{children}</WalletPresenceContext.Provider>;
}

export function useWalletPresence(): boolean | null {
  return useContext(WalletPresenceContext);
}
