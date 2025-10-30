import Link from "next/link";
import type { ReactElement } from "react";
import { bffFetch } from "@/lib/bff-fetch";
import { cn } from "@/lib/utils";

interface PageParams {
  tenantId: string;
  storeId: string;
}

interface TransactionsPageProps {
  params: Promise<PageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface WalletTransaction {
  txId: string;
  timestamp: string;
  confirmations: number;
  status: "confirmed" | "unconfirmed" | "replaced" | "double-spent";
  direction: "in" | "out";
  amount: string;
  fee?: string | null;
  rateUsd?: number | null;
  labels: string[];
  comment?: string | null;
  blockExplorerUrl?: string | null;
}

interface WalletTransactionsResponse {
  total?: number;
  items: WalletTransaction[];
}

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "unconfirmed", label: "Unconfirmed" },
  { value: "replaced", label: "Replaced" },
  { value: "double-spent", label: "Double-spent" }
] as const;

function parseStatus(search: Record<string, string | string[] | undefined>): string | undefined {
  const raw = search.status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return STATUS_OPTIONS.some((option) => option.value === normalized) ? normalized : undefined;
}

function parsePage(search: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(search.page) ? search.page[0] : search.page;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed) {
    return "0";
  }
  return `${trimmed} BTC`;
}

function buildQuery(page: number, status?: string): string {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set("page", String(page));
  }
  if (status) {
    params.set("status", status);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

type LoadTransactionsResult = {
  data: WalletTransactionsResponse | null;
  error: 'none' | 'notFound' | 'generic';
};

async function loadTransactions(
  storeId: string,
  page: number,
  status?: string
): Promise<LoadTransactionsResult> {
  const params = new URLSearchParams();
  params.set("skip", String((page - 1) * PAGE_SIZE));
  params.set("count", String(PAGE_SIZE));
  params.set("order", "desc");
  if (status) {
    params.set("status", status);
  }

  try {
    const response = await bffFetch(`/api/stores/${storeId}/wallets/btc/transactions?${params.toString()}`);
    if (response.status === 404) {
      return { data: null, error: 'notFound' };
    }
    if (!response.ok) {
      return { data: null, error: 'generic' };
    }
    const payload = (await response.json()) as WalletTransactionsResponse;
    return { data: payload, error: 'none' };
  } catch {
    return { data: null, error: 'generic' };
  }
}

const GENERIC_ERROR_MESSAGE = 'BTCPay недоступний. Спробуйте ще раз пізніше.';
const BFF_CONFIG_ERROR_MESSAGE =
  'BTC wallet transactions endpoint is missing in the PayPay BFF. Contact your administrator to update the integration.';

export default async function TransactionsPage({
  params,
  searchParams
}: TransactionsPageProps): Promise<ReactElement> {
  const [{ tenantId, storeId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const page = parsePage(resolvedSearchParams);
  const status = parseStatus(resolvedSearchParams);
  const [{ data, error: errorCode }] = await Promise.all([loadTransactions(storeId, page, status)]);
  const basePath = `/tenants/${tenantId}/stores/${storeId}/wallets/bitcoin/transactions`;

  const items = data?.items ?? [];
  const totalItems = typeof data?.total === "number" ? data.total : items.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(totalItems, items.length) / PAGE_SIZE));
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  const errorMessage =
    errorCode === 'notFound'
      ? BFF_CONFIG_ERROR_MESSAGE
      : errorCode === 'generic'
      ? GENERIC_ERROR_MESSAGE
      : null;
  const shouldShowRescanHint = !errorMessage && items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-3" action="" method="get">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Apply
          </button>
          {status ? (
            <Link
              href={basePath}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </form>
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-border/60 text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Confirmations</th>
              <th className="px-4 py-3">Labels</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                  No transactions found.
                </td>
              </tr>
            ) : (
              items.map((tx) => (
                <tr key={tx.txId} className="border-t border-border/60">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {formatTimestamp(tx.timestamp)}
                  </td>
                  <td className="px-4 py-3 capitalize text-foreground">{tx.direction === "in" ? "Receive" : "Send"}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatAmount(tx.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        tx.status === "confirmed"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : tx.status === "unconfirmed"
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{tx.confirmations}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {tx.labels.length > 0 ? tx.labels.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-foreground">{tx.txId}</span>
                      {tx.blockExplorerUrl ? (
                        <a
                          href={tx.blockExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          View in explorer
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <Link
          href={`${basePath}${buildQuery(page - 1, status)}`}
          className={cn(
            "inline-flex h-9 items-center rounded-md border border-border px-3 font-medium transition-colors",
            hasPrevious ? "text-foreground hover:bg-muted" : "pointer-events-none text-muted-foreground"
          )}
          aria-disabled={!hasPrevious}
        >
          Previous
        </Link>
        <Link
          href={`${basePath}${buildQuery(page + 1, status)}`}
          className={cn(
            "inline-flex h-9 items-center rounded-md border border-border px-3 font-medium transition-colors",
            hasNext ? "text-foreground hover:bg-muted" : "pointer-events-none text-muted-foreground"
          )}
          aria-disabled={!hasNext}
        >
          Next
        </Link>
      </div>

      {shouldShowRescanHint ? (
        <p className="text-sm text-muted-foreground">
          If BTCPay shows an invalid balance, rescan your wallet from the BTCPay Server interface.
        </p>
      ) : null}
    </div>
  );
}
