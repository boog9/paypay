import { cache } from "react";

import { bffFetch } from "../../../../../../lib/bff-fetch";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

export interface WalletPresenceResponse {
  hasWallet: boolean;
}

export interface WalletPresenceResult {
  status: number;
  hasWallet: boolean;
  payload: WalletPresenceResponse | null;
}

export const getWalletPresence = cache(async (storeId: string): Promise<WalletPresenceResult> => {
  const normalized = typeof storeId === "string" ? storeId.trim() : "";
  if (!normalized) {
    return { status: 400, hasWallet: false, payload: null } satisfies WalletPresenceResult;
  }

  try {
    const response = await bffFetch(walletPresencePath(normalized), {
      cache: "no-store",
    });

    const status = typeof response.status === "number" ? response.status : response.ok ? 200 : 0;

    if (!response.ok) {
      return { status, hasWallet: false, payload: null } satisfies WalletPresenceResult;
    }

    const raw = (await response.json()) as unknown;
    const payload = parseWalletPresence(raw);
    const hasWallet = Boolean(payload?.hasWallet);

    return { status, hasWallet, payload } satisfies WalletPresenceResult;
  } catch {
    return { status: 0, hasWallet: false, payload: null } satisfies WalletPresenceResult;
  }
});

export function parseWalletPresence(data: unknown): WalletPresenceResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const hasWallet = record.hasWallet === true;

  return { hasWallet } satisfies WalletPresenceResponse;
}

export function resolveWalletPresence(data: unknown): boolean {
  return Boolean(parseWalletPresence(data)?.hasWallet);
}
