import { cache } from "react";

import { bffFetch } from "../../../../../../lib/bff-fetch";
import { walletPresencePath } from "../../../../../../lib/walletPaths";

export interface WalletPresenceResponse {
  enabled: boolean;
  config: {
    derivationScheme: string | null;
  } | null;
}

export interface WalletPresenceResult {
  status: number;
  connected: boolean;
  payload: WalletPresenceResponse | null;
}

export const getWalletPresence = cache(async (storeId: string): Promise<WalletPresenceResult> => {
  const normalized = typeof storeId === "string" ? storeId.trim() : "";
  if (!normalized) {
    return { status: 400, connected: false, payload: null };
  }

  try {
    const response = await bffFetch(walletPresencePath(normalized), {
      cache: "no-store"
    });

    const status = typeof response.status === "number" ? response.status : response.ok ? 200 : 0;

    if (!response.ok) {
      return { status, connected: false, payload: null };
    }

    const raw = (await response.json()) as unknown;
    const payload = parseWalletPresence(raw);
    const connected = isWalletConnected(payload);

    return { status, connected, payload };
  } catch {
    return { status: 0, connected: false, payload: null };
  }
});

export function parseWalletPresence(data: unknown): WalletPresenceResponse | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const enabled = record.enabled === true;
  const rawConfig = record.config;

  if (rawConfig === null) {
    return { enabled, config: null } satisfies WalletPresenceResponse;
  }

  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return { enabled, config: { derivationScheme: null } } satisfies WalletPresenceResponse;
  }

  const configRecord = rawConfig as Record<string, unknown>;
  const derivation = typeof configRecord.derivationScheme === "string" ? configRecord.derivationScheme : null;

  return {
    enabled,
    config: { derivationScheme: derivation }
  } satisfies WalletPresenceResponse;
}

export function isWalletConnected(payload: WalletPresenceResponse | null): boolean {
  if (!payload) {
    return false;
  }

  const scheme = payload.config?.derivationScheme;
  return Boolean(payload.enabled && typeof scheme === "string" && scheme.trim().length > 0);
}

export function resolveWalletPresence(data: unknown): boolean {
  return isWalletConnected(parseWalletPresence(data));
}
