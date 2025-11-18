import { bffFetch } from "@/lib/bff-fetch";

export interface BitcoinWalletSettingsViewModel {
  hasOnChainPaymentMethod: boolean;
  enabled?: boolean;
  label?: string | null;
  accountKeyPath?: string | null;
  masterFingerprint?: string | null;
}

interface WalletSettingsResult {
  status: number;
  data: BitcoinWalletSettingsViewModel | null;
  error: string | null;
  attemptedRefresh: boolean;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSettingsPayload(payload: unknown): BitcoinWalletSettingsViewModel | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const hasOnChainPaymentMethod = record.hasOnChainPaymentMethod === true;
  const enabled = record.enabled === true;
  const label = normalizeString(record.label);
  const accountKeyPath = normalizeString(record.accountKeyPath);
  const masterFingerprint = (() => {
    const fingerprint = normalizeString(record.masterFingerprint);
    return fingerprint ? fingerprint.toUpperCase() : null;
  })();

  return {
    hasOnChainPaymentMethod,
    enabled,
    label,
    accountKeyPath,
    masterFingerprint,
  } satisfies BitcoinWalletSettingsViewModel;
}

async function attemptSessionRefresh(): Promise<boolean> {
  try {
    const response = await bffFetch("/api/auth/refresh", { method: "POST" });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return null;
}

export async function getWalletSettings(storeId: string): Promise<WalletSettingsResult> {
  const path = `/api/stores/${storeId}/wallets/bitcoin/onchain/settings`;
  let response: Response;
  let attemptedRefresh = false;

  try {
    response = await bffFetch(path);
  } catch {
    return {
      status: 0,
      data: null,
      error: "Unable to load wallet settings.",
      attemptedRefresh,
    } satisfies WalletSettingsResult;
  }

  if (response.status === 401) {
    attemptedRefresh = true;
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return { status: 401, data: null, error: "Unauthorized", attemptedRefresh };
    }

    try {
      response = await bffFetch(path);
    } catch {
      return {
        status: 0,
        data: null,
        error: "Unable to load wallet settings.",
        attemptedRefresh,
      } satisfies WalletSettingsResult;
    }
  }

  const payload = await readJsonPayload(response);

  if (response.status === 404) {
    return {
      status: 404,
      data: { hasOnChainPaymentMethod: false } satisfies BitcoinWalletSettingsViewModel,
      error: null,
      attemptedRefresh,
    } satisfies WalletSettingsResult;
  }

  const data = normalizeSettingsPayload(payload);
  const errorMessage = response.ok ? null : extractErrorMessage(payload) ?? response.statusText ?? null;

  if (response.ok && data) {
    return { status: response.status, data, error: null, attemptedRefresh } satisfies WalletSettingsResult;
  }

  return { status: response.status, data: null, error: errorMessage, attemptedRefresh } satisfies WalletSettingsResult;
}
