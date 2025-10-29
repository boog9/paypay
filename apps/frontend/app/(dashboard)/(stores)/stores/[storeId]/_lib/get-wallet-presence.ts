import { bffFetch } from "../../../../../../lib/bff-fetch";

export type WalletPresenceDTO = {
  hasWallet: boolean;
  enabled: boolean;
  derivationScheme: string | null;
};

export async function getWalletPresence(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  const res = await bffFetch(`/api/stores/${storeId}/wallets/btc/presence`, { cache: "no-store" });
  if (!res.ok) return false;
  const data: unknown = await res.json();
  if (!data || typeof data !== "object") return false;
  const { hasWallet, derivationScheme } = data as Partial<WalletPresenceDTO>;
  return hasWallet === true || (typeof derivationScheme === "string" && derivationScheme.length > 0);
}
