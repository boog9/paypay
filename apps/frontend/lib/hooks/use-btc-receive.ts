import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch } from "@/lib/bff-fetch";
import type {
  WalletReceiveAddress,
  WalletReservedAddressesResponse,
  WalletReservedAddress,
} from "@/src/types/wallets";

const RECEIVE_QUERY_KEY = (storeId: string) => ["btc-receive-address", storeId];
const RESERVED_QUERY_KEY = (storeId: string, take: number, skip: number) => [
  "btc-reserved-addresses",
  storeId,
  take,
  skip,
];

async function attemptSessionRefresh(): Promise<boolean> {
  try {
    const response = await bffFetch("/api/auth/refresh", { method: "POST" });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      const text = await response.clone().text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}

async function fetchWithRefresh(path: string): Promise<Response> {
  let response = await bffFetch(path);
  if (response.status === 401) {
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return response;
    }
    response = await bffFetch(path);
  }
  return response;
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

function normalizeReceiveAddress(payload: unknown): WalletReceiveAddress {
  if (!payload || typeof payload !== "object") {
    throw Object.assign(new Error("Invalid receive address payload"), { status: 500 });
  }
  const record = payload as Record<string, unknown>;
  const address = typeof record.address === "string" ? record.address.trim() : "";
  const paymentLink = typeof record.paymentLink === "string" ? record.paymentLink.trim() : null;
  const reservedAt = typeof record.reservedAt === "string" ? record.reservedAt.trim() : undefined;
  const isPayjoinEnabled =
    typeof record.isPayjoinEnabled === "boolean"
      ? record.isPayjoinEnabled
      : typeof record.payjoinEnabled === "boolean"
        ? record.payjoinEnabled
        : undefined;

  if (!address) {
    throw Object.assign(new Error("Receive address is missing"), { status: 500 });
  }

  const link = paymentLink && paymentLink.toLowerCase().startsWith("bitcoin:") ? paymentLink : `bitcoin:${address}`;

  return { address, paymentLink: link, reservedAt, isPayjoinEnabled } satisfies WalletReceiveAddress;
}

function normalizeReservedAddresses(payload: unknown): WalletReservedAddressesResponse {
  if (!payload) {
    return { items: [] } satisfies WalletReservedAddressesResponse;
  }

  if (Array.isArray(payload)) {
    const items = payload
      .map((item) => normalizeReservedAddress(item))
      .filter((item): item is WalletReservedAddress => item !== null);
    return { items, total: payload.length } satisfies WalletReservedAddressesResponse;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const itemsSource = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : [];
    const items = itemsSource
      .map((item) => normalizeReservedAddress(item))
      .filter((item): item is WalletReservedAddress => item !== null);
    const totalValue = record.total;
    const total = typeof totalValue === "number" && Number.isFinite(totalValue) ? totalValue : undefined;
    return { items, total } satisfies WalletReservedAddressesResponse;
  }

  return { items: [] } satisfies WalletReservedAddressesResponse;
}

function normalizeReservedAddress(payload: unknown): WalletReservedAddress | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const addressCandidates = [
    typeof data.address === "string" ? data.address.trim() : null,
    typeof record.id === "string" ? record.id.trim() : null,
  ].filter((entry): entry is string => !!entry && entry.trim().length > 0);

  const address = addressCandidates.find((entry) => entry.length > 0);
  if (!address) {
    return null;
  }

  const label = typeof data.label === "string" && data.label.trim() ? data.label.trim() : undefined;
  const reservedAt = extractTimestamp(data);

  return { address, label, reservedAt } satisfies WalletReservedAddress;
}

function extractTimestamp(record: Record<string, unknown>): string | undefined {
  const candidates = [record.reservedAt, record.createdAt, record.creationTime, record.timestamp, record.date];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

async function fetchReceiveAddress(storeId: string, forceGenerate?: boolean): Promise<WalletReceiveAddress> {
  const search = new URLSearchParams();
  if (forceGenerate) {
    search.set("forceGenerate", "true");
  }
  const path = `/api/stores/${storeId}/wallets/btc/actions/receive/next${search.toString() ? `?${search.toString()}` : ""}`;
  const response = await fetchWithRefresh(path);
  const payload = await readJson(response);
  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? response.statusText ?? "Failed to load receive address";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return normalizeReceiveAddress(payload);
}

async function fetchReservedAddresses(
  storeId: string,
  take: number,
  skip: number,
): Promise<WalletReservedAddressesResponse> {
  const search = new URLSearchParams();
  if (take > 0) {
    search.set("take", String(take));
  }
  if (skip > 0) {
    search.set("skip", String(skip));
  }
  const path = `/api/stores/${storeId}/wallets/btc/actions/receive/reserved${search.toString() ? `?${search.toString()}` : ""}`;
  const response = await fetchWithRefresh(path);
  const payload = await readJson(response);
  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? response.statusText ?? "Failed to load reserved addresses";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return normalizeReservedAddresses(payload);
}

export function useBtcReceiveAddress(storeId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: RECEIVE_QUERY_KEY(storeId),
    queryFn: () => fetchReceiveAddress(storeId),
    enabled: !!storeId,
  });

  const generateAnother = useMutation({
    mutationFn: () => fetchReceiveAddress(storeId, true),
    onSuccess: (data) => {
      queryClient.setQueryData(RECEIVE_QUERY_KEY(storeId), data);
    },
  });

  const generate = useCallback(() => generateAnother.mutateAsync(), [generateAnother]);

  return {
    ...query,
    generate,
    isGenerating: generateAnother.isPending,
  };
}

export function useBtcReservedAddresses(storeId: string, { take = 25, skip = 0, enabled = true } = {}) {
  return useQuery({
    queryKey: RESERVED_QUERY_KEY(storeId, take, skip),
    queryFn: () => fetchReservedAddresses(storeId, take, skip),
    enabled: !!storeId && enabled,
  });
}
