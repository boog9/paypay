import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadOverview, loadTransactions } from "./data-loaders";
import { getWalletPresence } from "@/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence";
import TransactionsClient from "./transactions-client";
import type { TransactionsQuery } from "./types";

export const metadata: Metadata = {
  title: "BTC wallet transactions",
};

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

type PageParams = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  max = Number.MAX_SAFE_INTEGER,
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

function TransactionsRateLimitNotice() {
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">BTC wallet transactions</h1>
        <p className="text-sm text-muted-foreground">
          Review on-chain activity, labels, and balances for your Bitcoin store wallet.
        </p>
      </header>
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-900">
        Too many requests to the BFF (rate limit). Please wait a few seconds and reload the transactions page.
      </div>
    </div>
  );
}

export default async function TransactionsPage({ params, searchParams }: PageParams) {
  const { storeId } = await params;
  const search = searchParams ? await searchParams : undefined;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";

  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const dashboardPath = `/stores/${normalizedStoreId}/dashboard`;
  const presence = await getWalletPresence(normalizedStoreId);

  if (presence.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (presence.status === 403) {
    redirect(dashboardPath);
  }

  if (presence.status === 404) {
    redirect(dashboardPath);
  }

  if (presence.status === 200 && !presence.hasWallet) {
    redirect(dashboardPath);
  }

  const query = parseSearchParams(search);

  const [transactions, overview] = await Promise.all([
    loadTransactions(normalizedStoreId, query),
    loadOverview(normalizedStoreId),
  ]);

  if (transactions.kind === "error" && transactions.status === 401 && transactions.attemptedRefresh) {
    redirect("/sign-in?reason=session-expired");
  }

  if (overview.kind === "error" && overview.status === 401 && overview.attemptedRefresh) {
    redirect("/sign-in?reason=session-expired");
  }

  if (transactions.kind === "error" && transactions.status === 404) {
    redirect(dashboardPath);
  }

  if (overview.kind === "error" && overview.status === 404) {
    redirect(dashboardPath);
  }

  if (transactions.kind === "rate-limited" || overview.kind === "rate-limited") {
    return <TransactionsRateLimitNotice />;
  }

  const error = (transactions.kind === "error" ? transactions.error : null)
    ?? (overview.kind === "error" ? overview.error : null);

  return (
    <TransactionsClient
      storeId={normalizedStoreId}
      initialQuery={query}
      transactions={transactions.kind === "ok" ? transactions.data : null}
      overview={overview.kind === "ok" ? overview.data : null}
      error={error}
    />
  );
}
