"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Copy,
  ExternalLink,
  FileDown,
  MessageSquare,
} from "lucide-react";

import { Button } from "../../../../../../../../components/ui/button";
import { Badge } from "../../../../../../../../components/ui/badge";
import { cn } from "../../../../../../../../lib/utils";
import type {
  WalletOverview,
  WalletTransaction,
  WalletTransactionsResponse,
} from "../../../../../../../../src/types/wallets";
import type { TransactionsQuery } from "./types";

const DEFAULT_COUNT = 50;
const CSV_HEADERS = [
  "date",
  "txid",
  "direction",
  "amount",
  "fee",
  "confirmations",
  "labels",
  "comment",
  "rateUsd",
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBtc(amount: string, direction: "in" | "out"): string {
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) {
    const sign = numeric < 0 ? "-" : direction === "out" ? "-" : "+";
    const formatted = Math.abs(numeric).toFixed(8);
    return `${sign}${formatted} BTC`;
  }

  const trimmed = amount.trim();
  if (!trimmed) {
    return "—";
  }
  return trimmed.toUpperCase().includes("BTC") ? trimmed : `${trimmed} BTC`;
}

function formatFee(fee: string | null | undefined): string {
  if (!fee) {
    return "—";
  }
  const numeric = Number(fee);
  if (Number.isFinite(numeric)) {
    return `${Math.abs(numeric).toFixed(8)} BTC`;
  }
  const trimmed = fee.trim();
  if (!trimmed) {
    return "—";
  }
  return trimmed.toUpperCase().includes("BTC") ? trimmed : `${trimmed} BTC`;
}

function resolveStatusVariant(status: WalletTransaction["status"]): { label: string; className: string } {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", className: "bg-emerald-500" };
    case "replaced":
      return { label: "Replaced", className: "bg-amber-500" };
    case "double-spent":
      return { label: "Double-spent", className: "bg-destructive" };
    default:
      return { label: "Unconfirmed", className: "bg-muted-foreground" };
  }
}

function escapeCsvValue(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type TransactionsClientProps = {
  storeId: string;
  initialQuery: TransactionsQuery;
  transactions: WalletTransactionsResponse | null;
  overview: WalletOverview | null;
  error: string | null;
};

export default function TransactionsClient({ storeId, initialQuery, transactions, overview, error }: TransactionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [labelInput, setLabelInput] = useState("");
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

  const items: WalletTransaction[] = useMemo(() => {
    if (!transactions) {
      return [];
    }
    return Array.isArray(transactions.items)
      ? transactions.items.filter((item): item is WalletTransaction => typeof item === "object" && item !== null)
      : [];
  }, [transactions]);

  const totalCount = useMemo(() => {
    if (!transactions || typeof transactions.total !== "number") {
      return null;
    }
    return Number.isFinite(transactions.total) ? transactions.total : null;
  }, [transactions]);

  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    for (const tx of items) {
      for (const label of tx.labels ?? []) {
        if (label) {
          set.add(label);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredByDirection = useMemo(() => {
    if (initialQuery.direction === "all") {
      return items;
    }
    return items.filter((tx) => tx.direction === initialQuery.direction);
  }, [items, initialQuery.direction]);

  const displayItems = filteredByDirection;

  const hasPrevious = initialQuery.skip > 0;
  const hasNext = totalCount !== null ? initialQuery.skip + items.length < totalCount : items.length >= initialQuery.count;
  const pageStart = displayItems.length > 0 ? initialQuery.skip + 1 : 0;
  const pageEnd = displayItems.length > 0 ? initialQuery.skip + displayItems.length : 0;

  const navigate = useCallback(
    (next: TransactionsQuery) => {
      startTransition(() => {
        const params = new URLSearchParams();
        if (next.skip > 0) {
          params.set("skip", String(next.skip));
        }
        if (next.count !== DEFAULT_COUNT) {
          params.set("count", String(next.count));
        }
        if (next.order !== "desc") {
          params.set("order", next.order);
        }
        if (next.direction !== "all") {
          params.set("direction", next.direction);
        }
        for (const label of next.labels) {
          params.append("labels", label);
        }
        const queryString = params.toString();
        router.push(`/stores/${storeId}/wallets/btc/transactions${queryString ? `?${queryString}` : ""}`);
      });
    },
    [router, storeId]
  );

  const handleDirectionChange = useCallback(
    (direction: TransactionsQuery["direction"]) => {
      if (direction === initialQuery.direction) {
        return;
      }
      navigate({ ...initialQuery, direction, skip: 0 });
    },
    [initialQuery, navigate]
  );

  const handleOrderToggle = useCallback(() => {
    const nextOrder = initialQuery.order === "desc" ? "asc" : "desc";
    navigate({ ...initialQuery, order: nextOrder, skip: 0 });
  }, [initialQuery, navigate]);

  const handleAddLabel = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return;
      }
      if (initialQuery.labels.includes(trimmed)) {
        setLabelInput("");
        return;
      }
      const nextLabels = [...initialQuery.labels, trimmed].slice(0, 10);
      navigate({ ...initialQuery, labels: nextLabels, skip: 0 });
      setLabelInput("");
    },
    [initialQuery, navigate]
  );

  const handleRemoveLabel = useCallback(
    (label: string) => {
      const nextLabels = initialQuery.labels.filter((item) => item !== label);
      navigate({ ...initialQuery, labels: nextLabels, skip: 0 });
    },
    [initialQuery, navigate]
  );

  const handleResetFilters = useCallback(() => {
    setLabelInput("");
    navigate({ ...initialQuery, labels: [], direction: "all", skip: 0 });
  }, [initialQuery, navigate]);

  const handlePagination = useCallback(
    (direction: "previous" | "next") => {
      if (direction === "previous" && hasPrevious) {
        navigate({ ...initialQuery, skip: Math.max(initialQuery.skip - initialQuery.count, 0) });
      }
      if (direction === "next" && hasNext) {
        navigate({ ...initialQuery, skip: initialQuery.skip + initialQuery.count });
      }
    },
    [hasNext, hasPrevious, initialQuery, navigate]
  );

  const handleExportCsv = useCallback(() => {
    if (!displayItems.length) {
      return;
    }
    const rows = [CSV_HEADERS.join(",")];
    for (const tx of displayItems) {
      const row = [
        formatDate(tx.timestamp),
        tx.txId,
        tx.direction,
        tx.amount,
        tx.fee ?? "",
        String(tx.confirmations ?? 0),
        tx.labels.join("|"),
        tx.comment ?? "",
        tx.rateUsd != null ? String(tx.rateUsd) : "",
      ];
      rows.push(row.map(escapeCsvValue).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `btc-transactions-${new Date().toISOString()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [displayItems]);

  const handleCopy = useCallback(async (txId: string) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(txId);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = txId;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedTxId(txId);
      setTimeout(() => setCopiedTxId(null), 2000);
    } catch {
      setCopiedTxId(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">BTC Wallet</p>
            <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          </div>
          {overview ? (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                Confirmed balance: <strong className="font-medium text-foreground">{overview.confirmedBalance} BTC</strong>
              </span>
              <span>
                Unconfirmed: <strong className="font-medium text-foreground">{overview.unconfirmedBalance} BTC</strong>
              </span>
              <span>
                Total: <strong className="font-medium text-foreground">{overview.balance} BTC</strong>
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/stores/${storeId}/reports`} aria-label="Open reporting">
              <BarChart3 className="mr-2 h-4 w-4" aria-hidden /> Reporting
            </Link>
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="outline" aria-haspopup="menu" aria-label="Export transactions">
                <FileDown className="mr-2 h-4 w-4" aria-hidden /> Export
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                className="z-50 min-w-[160px] rounded-md border bg-popover p-1 text-sm shadow-lg outline-none"
              >
                <DropdownMenu.Item
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition focus:bg-muted"
                  onSelect={(event) => {
                    event.preventDefault();
                    handleExportCsv();
                  }}
                >
                  CSV
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={initialQuery.direction === "all" ? "default" : "outline"}
            onClick={() => handleDirectionChange("all")}
            aria-pressed={initialQuery.direction === "all"}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={initialQuery.direction === "in" ? "default" : "outline"}
            onClick={() => handleDirectionChange("in")}
            aria-pressed={initialQuery.direction === "in"}
          >
            Incoming
          </Button>
          <Button
            size="sm"
            variant={initialQuery.direction === "out" ? "default" : "outline"}
            onClick={() => handleDirectionChange("out")}
            aria-pressed={initialQuery.direction === "out"}
          >
            Outgoing
          </Button>
        </div>
        <div className="flex flex-1 min-w-[220px] items-center gap-2">
          <div className="relative flex-1">
            <input
              value={labelInput}
              onChange={(event) => setLabelInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddLabel(labelInput);
                }
              }}
              list="wallet-label-options"
              placeholder="Filter by label"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Filter by label"
            />
            <datalist id="wallet-label-options">
              {availableLabels.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleAddLabel(labelInput)}>
            Add
          </Button>
          <Button size="sm" variant="outline" onClick={handleResetFilters}>
            Clear
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={handleOrderToggle}>
          Sort {initialQuery.order === "desc" ? "↑" : "↓"}
        </Button>
      </div>

      {initialQuery.labels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active labels:</span>
          {initialQuery.labels.map((label) => (
            <Badge key={label} variant="secondary" className="flex items-center gap-1">
              {label}
              <button
                type="button"
                onClick={() => handleRemoveLabel(label)}
                className="ml-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label={`Remove label ${label}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Labels</th>
              <th className="px-3 py-2 font-medium">Transaction</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium text-right">Transaction fee</th>
              <th className="px-3 py-2 font-medium text-right">Rate (USD)</th>
              <th className="px-3 py-2 font-medium text-center">Comment</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {isPending ? "Loading transactions…" : "No transactions found for this filter."}
                </td>
              </tr>
            ) : (
              displayItems.map((tx) => {
                const indicator = resolveStatusVariant(tx.status);
                const truncated = tx.txId.length > 16 ? `${tx.txId.slice(0, 10)}…${tx.txId.slice(-4)}` : tx.txId;
                const amountClass = cn(
                  "text-right text-sm font-medium",
                  tx.direction === "in" ? "text-emerald-600" : "text-destructive",
                  tx.status === "unconfirmed" ? "opacity-70" : undefined
                );
                const rowClass = cn("border-b last:border-b-0", tx.status === "unconfirmed" && "opacity-90");
                return (
                  <tr key={tx.txId} className={rowClass}>
                    <td className="px-3 py-3 align-top text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", indicator.className)} aria-hidden />
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{formatDate(tx.timestamp)}</span>
                          <span className="text-xs text-muted-foreground">{indicator.label}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-sm">
                      <div className="flex flex-wrap gap-1">
                        {tx.labels.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                        {tx.labels.map((label) => (
                          <Badge key={`${tx.txId}-${label}`} variant="outline">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{truncated}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopy(tx.txId);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground transition hover:bg-muted"
                          aria-label="Copy transaction ID"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {tx.blockExplorerUrl ? (
                          <Link
                            href={tx.blockExplorerUrl}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground transition hover:bg-muted"
                            aria-label="Open in block explorer"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        ) : null}
                      </div>
                      {copiedTxId === tx.txId ? (
                        <span className="mt-1 inline-block text-xs text-muted-foreground">Copied</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className={amountClass}>{formatBtc(tx.amount, tx.direction)}</div>
                    </td>
                    <td className="px-3 py-3 align-top text-right text-sm text-muted-foreground">
                      {formatFee(tx.fee)}
                    </td>
                    <td className="px-3 py-3 align-top text-right text-sm text-muted-foreground">
                      {formatUsd(tx.rateUsd ?? null)}
                    </td>
                    <td className="px-3 py-3 align-top text-center text-sm">
                      {tx.comment ? (
                        <span title={tx.comment} className="inline-flex items-center justify-center text-muted-foreground">
                          <MessageSquare className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Comment available</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>
          {displayItems.length > 0 ? (
            <span>
              Showing <strong className="text-foreground">{pageStart}</strong>–
              <strong className="text-foreground">{pageEnd}</strong>
            </span>
          ) : (
            <span>No results to display</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasPrevious || isPending}
            onClick={() => handlePagination("previous")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNext || isPending}
            onClick={() => handlePagination("next")}
          >
            Next <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        If BTCPay shows an invalid balance, rescan your wallet from the BTCPay Server interface.
      </p>
    </div>
  );
}
