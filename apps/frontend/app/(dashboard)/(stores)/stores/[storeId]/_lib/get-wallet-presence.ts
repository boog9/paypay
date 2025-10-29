import { bffFetch } from "../../../../../../lib/bff-fetch";

type WalletPresencePayload = {
  hasWallet?: unknown;
  enabled?: unknown;
  derivationScheme?: unknown;
};

function resolveWalletPresence(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as WalletPresencePayload;
  if (payload.hasWallet === true) {
    return true;
  }
  if (payload.enabled === true) {
    return true;
  }
  if (typeof payload.derivationScheme === "string" && payload.derivationScheme.length > 0) {
    return true;
  }
  return false;
}

export async function getWalletPresence(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  const res = await bffFetch(`/api/stores/${storeId}/wallets/btc`, { method: "GET", next: { revalidate: 0 } });
  if (!res.ok) return false;
  const data = (await res.json()) as unknown;
  return resolveWalletPresence(data);
}
