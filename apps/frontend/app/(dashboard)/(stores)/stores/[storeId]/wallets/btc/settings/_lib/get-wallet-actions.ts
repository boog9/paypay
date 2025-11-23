import { bffFetch } from "@/lib/bff-fetch";

export type WalletActionId = "prune-history" | "clear-history" | "replace" | "remove";

export interface WalletActionsResult {
  status: number;
  data: WalletActionId[] | null;
  error: string | null;
  attemptedRefresh: boolean;
}

const ALLOWED_ACTIONS: WalletActionId[] = ["prune-history", "clear-history", "replace", "remove"];

type UnknownRecord = Record<string, unknown>;

function isWalletActionId(value: unknown): value is WalletActionId {
  if (typeof value !== "string") {
    return false;
  }
  return ALLOWED_ACTIONS.includes(value.trim() as WalletActionId);
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

function normalizeActionsPayload(payload: unknown): WalletActionId[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as UnknownRecord;
  const actions = record.actions;

  if (!Array.isArray(actions)) {
    return null;
  }

  const normalized = actions
    .map((action) => (typeof action === "string" ? action.trim() : ""))
    .filter((action): action is WalletActionId => isWalletActionId(action));

  return normalized;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as UnknownRecord;
  const message = record.message;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return null;
}

async function attemptSessionRefresh(): Promise<boolean> {
  try {
    const response = await bffFetch("/api/auth/refresh", { method: "POST" });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export async function getWalletActions(storeId: string): Promise<WalletActionsResult> {
  const path = `/api/stores/${storeId}/wallets/btc/actions`;
  let response: Response;
  let attemptedRefresh = false;

  try {
    response = await bffFetch(path);
  } catch {
    return { status: 0, data: null, error: "Unable to load wallet actions.", attemptedRefresh } satisfies WalletActionsResult;
  }

  if (response.status === 401) {
    attemptedRefresh = true;
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return { status: 401, data: null, error: "Unauthorized", attemptedRefresh } satisfies WalletActionsResult;
    }

    try {
      response = await bffFetch(path);
    } catch {
      return { status: 0, data: null, error: "Unable to load wallet actions.", attemptedRefresh } satisfies WalletActionsResult;
    }
  }

  const payload = await readJsonPayload(response);

  if (response.ok) {
    const actions = normalizeActionsPayload(payload) ?? [];
    return { status: response.status, data: actions, error: null, attemptedRefresh } satisfies WalletActionsResult;
  }

  const message = extractErrorMessage(payload) ?? response.statusText ?? null;
  return { status: response.status, data: null, error: message, attemptedRefresh } satisfies WalletActionsResult;
}
