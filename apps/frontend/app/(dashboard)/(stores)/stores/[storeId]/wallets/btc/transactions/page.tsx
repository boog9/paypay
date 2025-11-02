import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { bffFetch } from "@/lib/bff-fetch";
import type { WalletOverview, WalletTransactionsResponse } from "../../../../../../../../src/types/wallets";
import TransactionsClient from "./transactions-client";
import type { TransactionsQuery } from "./types";

export const metadata: Metadata = {
  title: "BTC wallet transactions",
};

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;
const BFF_CONFIG_ERROR_MESSAGE =
  'BTC wallet transactions endpoint is missing in the PayPay BFF. Contact your administrator to update the integration.';

type PageParams = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FetchResult<T> = {
  status: number;
  data: T | null;
  error: string | null;
  attemptedRefresh: boolean;
};

function parseSearchParams(params?: Record<string, string | string[] | undefined>): TransactionsQuery {
  const result: TransactionsQuery = {
    skip: 0,
    take: DEFAULT_TAKE,
    order: "desc",
    labels: [],
  };

  if (!params) {
    return result;
  }

  const skip = parseIntParam(params.skip, 0, 0);
  const rawTake = extractString(params.take);
  const countParam = rawTake ?? extractString(params.count);
  const take = parseIntParam(countParam, DEFAULT_TAKE, 1, MAX_TAKE);
  const orderRaw = extractString(params.order)?.toLowerCase();
  const labelsRaw = normalizeLabels(params.labels ?? params.label);

  result.skip = skip;
  result.take = take;
  if (orderRaw === "asc" || orderRaw === "desc") {
    result.order = orderRaw;
  }
  result.labels = labelsRaw;

  return result;
}

function parseIntParam(
  value: string | string[] | null | undefined,
  fallback: number,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  const str = extractString(value);
  if (!str) {
    return fallback;
  }
  const parsed = Number(str);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function extractString(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function normalizeLabels(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const rawValues = Array.isArray(value) ? value : value.split(",");
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawValues) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.slice(0, 120);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(normalized);
    if (labels.length >= 10) {
      break;
    }
  }

  return labels;
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
    items: items.filter((item): item is WalletTransactionsResponse["items"][number] => typeof item === "object" && item !== null)
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

async function loadTransactions(storeId: string, query: TransactionsQuery): Promise<FetchResult<WalletTransactionsResponse>> {
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
    return { status: 0, data: null, error: "Failed to load transactions.", attemptedRefresh: false };
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
      return { status: 0, data: null, error: "Failed to load transactions.", attemptedRefresh };
    }
  }

  if (response.status === 404) {
    return { status: 404, data: null, error: BFF_CONFIG_ERROR_MESSAGE, attemptedRefresh };
  }

  const payload = await readJsonPayload(response);
  const data = normalizeTransactionsPayload(payload);
  const errorMessage = response.ok ? null : extractErrorMessage(payload) ?? response.statusText ?? null;

  return {
    status: response.status,
    data: response.ok && data ? data : null,
    error: errorMessage,
    attemptedRefresh,
  } satisfies FetchResult<WalletTransactionsResponse>;
}

async function loadOverview(storeId: string): Promise<FetchResult<WalletOverview>> {
  const path = `/api/stores/${storeId}/wallets/btc/overview`;
  let response: Response;
  let attemptedRefresh = false;

  try {
    response = await bffFetch(path);
  } catch {
    return { status: 0, data: null, error: "Failed to load overview.", attemptedRefresh: false };
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
      return { status: 0, data: null, error: "Failed to load overview.", attemptedRefresh };
    }
  }

  const payload = await readJsonPayload(response);
  const data = normalizeOverviewPayload(payload);
  const errorMessage = response.ok ? null : extractErrorMessage(payload) ?? response.statusText ?? null;

  return {
    status: response.status,
    data: response.ok && data ? data : null,
    error: errorMessage,
    attemptedRefresh,
  } satisfies FetchResult<WalletOverview>;
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

export default async function TransactionsPage({ params, searchParams }: PageParams) {
  const { storeId } = await params;
  const search = searchParams ? await searchParams : undefined;
  const query = parseSearchParams(search);

  const [transactions, overview] = await Promise.all([
    loadTransactions(storeId, query),
    loadOverview(storeId),
  ]);

  if (transactions.status === 401 && transactions.attemptedRefresh) {
    redirect("/sign-in?reason=session-expired");
  }

  if (overview.status === 401 && overview.attemptedRefresh) {
    redirect("/sign-in?reason=session-expired");
  }

  const error = transactions.error ?? overview.error;

  return (
    <TransactionsClient
      storeId={storeId}
      initialQuery={query}
      transactions={transactions.data}
      overview={overview.data}
      error={error}
    />
  );
}
