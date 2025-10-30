import { bffFetch } from "../../../../../../lib/bff-fetch";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

type WalletPresencePayload = {
  hasWallet?: unknown;
  enabled?: unknown;
  derivationScheme?: unknown; // legacy top-level
  config?: { derivationScheme?: unknown } | null; // canonical in 2.x
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

  // 1) explicit indicator
  if (payload.hasWallet === true) return true;

  // 2) canonical derivation scheme path
  const dsFromConfig =
    payload.config && typeof payload.config === "object"
      ? payload.config.derivationScheme
      : undefined;

  const ds =
    typeof dsFromConfig === "string" && dsFromConfig.trim().length > 0
      ? dsFromConfig.trim()
      : typeof payload.derivationScheme === "string" && payload.derivationScheme.trim().length > 0
      ? payload.derivationScheme.trim()
      : null;

  if (ds) return true;

  // 3) last-resort legacy behavior
  if (payload.enabled === true) return true;

  return false;
}
