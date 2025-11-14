"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { bffFetch } from "../../lib/bff-fetch";
import { walletPresencePath } from "../../lib/walletPaths";

export interface BitcoinWalletPresence {
  hasWallet: boolean | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const defaultPresence: BitcoinWalletPresence = {
  hasWallet: null,
  loading: false,
  error: null,
  refresh: async () => {},
};

const PresenceContext = createContext<BitcoinWalletPresence>(defaultPresence);

export function WalletPresenceProvider({
  storeId,
  initial,
  children,
}: {
  storeId: string | null;
  initial: boolean | null;
  children: ReactNode;
}) {
  const [hasWallet, setHasWallet] = useState<boolean | null>(
    typeof initial === "boolean" ? initial : null,
  );
  const [loading, setLoading] = useState<boolean>(Boolean(storeId && typeof initial !== "boolean"));
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
        throw new Error(`Wallet presence request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { hasWallet?: boolean };
      setHasWallet(payload?.hasWallet === true);
      setLoading(false);
    } catch (unknownError) {
      const normalizedError =
        unknownError instanceof Error
          ? unknownError
          : new Error("Failed to load wallet presence");
      setError(normalizedError);
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

    const hasInitial = typeof initial === "boolean";
    setHasWallet(hasInitial ? initial : null);
    setError(null);

    if (!hasInitial) {
      setLoading(true);
      void fetchPresence();
      return;
    }

    setLoading(false);
  }, [storeId, initial, fetchPresence]);

  const value = useMemo<BitcoinWalletPresence>(
    () => ({ hasWallet, loading, error, refresh: fetchPresence }),
    [hasWallet, loading, error, fetchPresence],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function useBtcWalletPresence(): BitcoinWalletPresence {
  return useContext(PresenceContext);
}
