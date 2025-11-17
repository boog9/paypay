import { bffFetch } from "@/lib/bff-fetch";
import type { WalletOverview, WalletTransactionsResponse } from "../../../../../../../../src/types/wallets";

const BFF_CONFIG_ERROR_MESSAGE =
  'BTC wallet transactions endpoint is missing in the PayPay BFF. Contact your administrator to update the integration.';

export type FetchResult<T> =
  | { kind: "ok"; status: number; data: T; error: null; attemptedRefresh: boolean }
  | { kind: "rate-limited"; status: 429; data: null; error: string | null; attemptedRefresh: boolean }
  | { kind: "error"; status: number; data: null; error: string | null; attemptedRefresh: boolean };

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

function normalizeTransactionsPayload(payload: unknown): WalletTransactionsResponse | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : [];
  const totalValue = record.total;
  const total = typeof totalValue === "number" ? totalValue : Number(totalValue);

  return {
    total: Number.isFinite(total) ? total : undefined,
    items: items.filter((item): item is WalletTransactionsResponse["items"][number] => typeof item === "object" && item !== null),
  };
}

function normalizeOverviewPayload(payload: unknown): WalletOverview | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const balance = extractNumericString(record.balance);
  const confirmed = extractNumericString(record.confirmedBalance);
  const unconfirmed = extractNumericString(record.unconfirmedBalance);
  const label = typeof record.label === "string" ? record.label.trim() || null : null;

  return {
    balance: balance ?? "0",
    confirmedBalance: confirmed ?? "0",
    unconfirmedBalance: unconfirmed ?? "0",
    label,
  } satisfies WalletOverview;
}

function extractNumericString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
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

export async function loadTransactions(
  storeId: string,
  query: { skip: number; take: number; order: "asc" | "desc"; labels: string[] },
): Promise<FetchResult<WalletTransactionsResponse>> {
  const search = new URLSearchParams();
  search.set("skip", String(query.skip));
  search.set("take", String(query.take));
  search.set("order", query.order);
  search.set("cryptoCode", "BTC");
  for (const label of query.labels) {
    search.append("labels", label);
  }

  const path = `/api/stores/${storeId}/wallets/onchain/transactions?${search.toString()}`;

  let response: Response;
  let attemptedRefresh = false;

  try {
    response = await bffFetch(path);
  } catch {
    return { kind: "error", status: 0, data: null, error: "Failed to load transactions.", attemptedRefresh: false };
  }

  if (response.status === 401) {
    attemptedRefresh = true;
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return { kind: "error", status: 401, data: null, error: "Unauthorized", attemptedRefresh };
    }
    try {
      response = await bffFetch(path);
    } catch {
      return { kind: "error", status: 0, data: null, error: "Failed to load transactions.", attemptedRefresh };
    }
  }

  if (response.status === 404) {
    return { kind: "error", status: 404, data: null, error: BFF_CONFIG_ERROR_MESSAGE, attemptedRefresh };
  }

  const payload = await readJsonPayload(response);
  const data = normalizeTransactionsPayload(payload);
  const errorMessage = response.ok ? null : extractErrorMessage(payload) ?? response.statusText ?? null;

  if (response.status === 429) {
    return {
      kind: "rate-limited",
      status: 429,
      data: null,
      error: errorMessage,
      attemptedRefresh,
    } satisfies FetchResult<WalletTransactionsResponse>;
  }

  if (response.ok && data) {
    return {
      kind: "ok",
      status: response.status,
      data,
      error: null,
      attemptedRefresh,
    } satisfies FetchResult<WalletTransactionsResponse>;
  }

  return {
    kind: "error",
    status: response.status,
    data: null,
    error: errorMessage,
    attemptedRefresh,
  } satisfies FetchResult<WalletTransactionsResponse>;
}

export async function loadOverview(storeId: string): Promise<FetchResult<WalletOverview>> {
  const path = `/api/stores/${storeId}/wallets/btc/overview`;
  let response: Response;
  let attemptedRefresh = false;

  try {
    response = await bffFetch(path);
  } catch {
    return { kind: "error", status: 0, data: null, error: "Failed to load overview.", attemptedRefresh: false };
  }

  if (response.status === 401) {
    attemptedRefresh = true;
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return { kind: "error", status: 401, data: null, error: "Unauthorized", attemptedRefresh };
    }
    try {
      response = await bffFetch(path);
    } catch {
      return { kind: "error", status: 0, data: null, error: "Failed to load overview.", attemptedRefresh };
    }
  }

  if (response.status === 404) {
    return { kind: "error", status: 404, data: null, error: BFF_CONFIG_ERROR_MESSAGE, attemptedRefresh };
  }

  const payload = await readJsonPayload(response);
  const data = normalizeOverviewPayload(payload);
  const errorMessage = response.ok ? null : extractErrorMessage(payload) ?? response.statusText ?? null;

  if (response.status === 429) {
    return {
      kind: "rate-limited",
      status: 429,
      data: null,
      error: errorMessage,
      attemptedRefresh,
    } satisfies FetchResult<WalletOverview>;
  }

  if (response.ok && data) {
    return {
      kind: "ok",
      status: response.status,
      data,
      error: null,
      attemptedRefresh,
    } satisfies FetchResult<WalletOverview>;
  }

  return {
    kind: "error",
    status: response.status,
    data: null,
    error: errorMessage,
    attemptedRefresh,
  } satisfies FetchResult<WalletOverview>;
}
