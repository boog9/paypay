"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { bffFetch } from "../../lib/bff-fetch";
import { walletPresencePath } from "../../lib/walletPaths";
import { useStoreContext } from "./store-context";

type WalletPresenceValue = {
  hasWallet: boolean | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const WalletPresenceContext = createContext<WalletPresenceValue>({
  hasWallet: null,
  loading: false,
  error: null,
  refresh: async () => {},
});

export function WalletPresenceProvider({
  initial,
  children,
}: {
  initial: boolean | null;
  children: ReactNode;
}) {
  const { storeId } = useStoreContext();
  const [hasWallet, setHasWallet] = useState<boolean | null>(
    typeof initial === "boolean" ? initial : null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPresence = useCallback(async () => {
    if (!storeId) {
      setHasWallet(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await bffFetch(walletPresencePath(storeId));
      if (!response.ok) {
        throw new Error(`Wallet presence request failed (${response.status})`);
      }
      const payload = (await response.json()) as { hasWallet?: boolean };
      setHasWallet(payload?.hasWallet === true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load wallet presence"));
      setHasWallet(null);
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      setHasWallet(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (typeof initial === "boolean") {
      setHasWallet(initial);
      setLoading(false);
      setError(null);
    } else {
      void fetchPresence();
    }
  }, [storeId, initial, fetchPresence]);

  return (
    <WalletPresenceContext.Provider
      value={{ hasWallet, loading, error, refresh: fetchPresence }}
    >
      {children}
    </WalletPresenceContext.Provider>
  );
}

export function useWalletPresence(): WalletPresenceValue {
  return useContext(WalletPresenceContext);
}
