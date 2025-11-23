import { bffFetch } from "../../../../../../lib/bff-fetch";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

export interface WalletPresenceResponse {
  hasWallet: boolean;
}

export interface WalletPresenceResult {
  status: number;
  connected: boolean;
  hasWallet: boolean;
  payload: WalletPresenceResponse | null;
}

export const getWalletPresence = async (storeId: string): Promise<WalletPresenceResult> => {
  const normalized = typeof storeId === "string" ? storeId.trim() : "";
  if (!normalized) {
    return { status: 400, connected: false, hasWallet: false, payload: null } satisfies WalletPresenceResult;
  }

  try {
    const response = await bffFetch(walletPresencePath(normalized), {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    const status = typeof response.status === "number" ? response.status : response.ok ? 200 : 0;

    if (response.status === 429) {
      return { status, connected: true, hasWallet: true, payload: null } satisfies WalletPresenceResult;
    }

    if (!response.ok) {
      return { status, connected: false, hasWallet: false, payload: null } satisfies WalletPresenceResult;
    }

    const raw = (await response.json()) as unknown;
    const payload = parseWalletPresence(raw);
    const connected = isWalletConnected(payload);
    const hasWallet = connected;

    return { status, connected, hasWallet, payload } satisfies WalletPresenceResult;
  } catch {
    return { status: 0, connected: false, hasWallet: false, payload: null } satisfies WalletPresenceResult;
  }
};

export function parseWalletPresence(data: unknown): WalletPresenceResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const hasWallet = record.hasWallet === true;

  return { hasWallet } satisfies WalletPresenceResponse;
}

export function resolveWalletPresence(data: unknown): boolean {
  return isWalletConnected(parseWalletPresence(data));
}

function isWalletConnected(payload: WalletPresenceResponse | null): boolean {
  return Boolean(payload?.hasWallet);
}
