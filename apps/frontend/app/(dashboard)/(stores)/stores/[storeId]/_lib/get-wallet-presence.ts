import { bffFetch } from "../../../../../../lib/bff-fetch";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

type WalletPresencePayload = {
  enabled?: unknown;
  config?: { derivationScheme?: unknown } | null;
};

export async function getWalletPresence(storeId: string): Promise<boolean> {
  const res = await bffFetch(walletPresencePath(storeId), {
    cache: "no-store"
  });
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as unknown;
  return resolveWalletPresence(data);
}

export function resolveWalletPresence(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as WalletPresencePayload;

  return Boolean(
    payload &&
      payload.enabled === true &&
      payload.config &&
      typeof payload.config.derivationScheme === "string" &&
      payload.config.derivationScheme.trim().length > 0
  );
}
