"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { ArrowLeft, Copy, List, Loader2, QrCode, RefreshCw } from "lucide-react";

import { Button } from "../../../../../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { Select } from "../../../../../../../../components/ui/select";
import { Skeleton } from "../../../../../../../../components/ui/skeleton";
import { useToast } from "../../../../../../../../components/ui/toast";
import { cn } from "../../../../../../../../lib/utils";
import { useBtcReceiveAddress, useBtcReservedAddresses } from "@/lib/hooks/use-btc-receive";
import type { WalletReservedAddress } from "@/src/types/wallets";

type ReceiveClientProps = {
  storeId: string;
  hasWallet: boolean;
};

type ReceiveMode = "address" | "link";
type ViewMode = "current" | "reserved";

function useErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as { status?: unknown };
  const status = record.status;
  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }
  return null;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ReceiveClient({ storeId, hasWallet }: ReceiveClientProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<ReceiveMode>("address");
  const [view, setView] = useState<ViewMode>("current");

  const receiveQuery = useBtcReceiveAddress(storeId);
  const reservedQuery = useBtcReservedAddresses(storeId, { take: 25, skip: 0, enabled: view === "reserved" });

  const receiveErrorStatus = useErrorStatus(receiveQuery.error);
  const reservedErrorStatus = useErrorStatus(reservedQuery.error);

  const displayValue = useMemo(() => {
    if (!receiveQuery.data) return null;
    return mode === "link" ? receiveQuery.data.paymentLink : receiveQuery.data.address;
  }, [mode, receiveQuery.data]);

  const loadingReceive = receiveQuery.isPending;
  const hasReceiveError = !!receiveQuery.error && !loadingReceive;
  const noWallet = !hasWallet || receiveErrorStatus === 404;

  const handleCopy = (value: string | null) => {
    if (!value) return;
    if (!navigator.clipboard?.writeText) return;

    navigator.clipboard
      .writeText(value)
      .then(() => toast({ title: "Copied", description: "Value copied to clipboard" }))
      .catch((error) => {
        console.warn("Failed to copy value", error);
        toast({
          title: "Copy failed",
          description: "Unable to write to clipboard. Please copy manually.",
          variant: "destructive",
        });
      });
  };

  const handleGenerate = () => {
    void (async () => {
      try {
        await receiveQuery.generate();
        setMode("address");
        toast({ title: "New address", description: "A new receive address was generated." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate a new address.";
        toast({ title: "Unable to generate", description: message, variant: "destructive" });
      }
    })();
  };

  const renderNoWallet = () => (
    <Card>
      <CardHeader>
        <CardTitle>No on-chain BTC wallet configured</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          We could not find an on-chain Bitcoin wallet for this store. Configure a watch-only wallet to start
          receiving payments.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/stores/${storeId}/wallets/btc/wizard`}>Open wallet wizard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/stores/${storeId}/wallets/btc/settings`}>Go to wallet settings</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderReceiveContent = () => {
    if (loadingReceive) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Receive BTC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-6 shadow-sm dark:bg-white">
                <Skeleton className="h-56 w-56" />
              </div>
            </div>
            <div className="space-y-3 text-center">
              <Skeleton className="mx-auto h-4 w-32" />
              <Skeleton className="mx-auto h-5 w-64" />
            </div>
            <div className="flex justify-center gap-2">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-28" />
            </div>
            <div>
              <Skeleton className="h-10 w-full sm:w-64" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-52" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (hasReceiveError) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Receive BTC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {receiveErrorStatus === 401 || receiveErrorStatus === 403
                ? "You do not have access to this store."
                : "Unable to load your receive address. Please try again."}
            </p>
            <Button onClick={() => void receiveQuery.refetch()} disabled={receiveQuery.isFetching}>
              {receiveQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Receive BTC</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            {displayValue ? (
              <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-white">
                <QRCode value={displayValue} size={224} fgColor="#0f172a" />
              </div>
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed">
                <QrCode className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-2 text-center">
            <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
              {mode === "address" ? "ADDRESS" : "PAYMENT LINK"}
            </div>
            <div className="flex items-center justify-center gap-2 break-all font-mono text-sm">
              <span className="max-w-xl truncate" title={displayValue ?? undefined}>
                {displayValue ?? "—"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleCopy(displayValue)}
                disabled={!displayValue}
                aria-label="Copy"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              variant={mode === "address" ? "default" : "outline"}
              onClick={() => setMode("address")}
              size="sm"
            >
              Address
            </Button>
            <Button variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")} size="sm">
              Link
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">LABELS</div>
            <Select disabled className="w-full sm:w-64" defaultValue="" aria-label="Labels">
              <option value="" disabled>
                Select
              </option>
            </Select>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => handleGenerate()} disabled={receiveQuery.isGenerating}>
              {receiveQuery.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate another address
            </Button>
            <Button variant="outline" onClick={() => setView("reserved")}>
              <List className="mr-2 h-4 w-4" />
              Reserved addresses
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderReservedContent = () => {
    if (reservedQuery.isPending) {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Reserved Addresses</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView("current")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      );
    }

    if (reservedQuery.error) {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Reserved Addresses</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView("current")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {reservedErrorStatus === 401 || reservedErrorStatus === 403
                ? "You do not have access to this store."
                : "Unable to load reserved addresses."}
            </p>
            <Button onClick={() => void reservedQuery.refetch()} disabled={reservedQuery.isFetching}>
              {reservedQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    const items = reservedQuery.data?.items ?? [];

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Reserved Addresses</CardTitle>
            <p className="text-sm text-muted-foreground">Addresses reserved in BTCPay Server for your store.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setView("current")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to receive
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No reserved addresses yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">Address</th>
                    <th className="py-2 pr-4 font-semibold">Label</th>
                    <th className="py-2 pr-4 font-semibold">Reserved At</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ReservedRow key={item.address} address={item} onCopy={handleCopy} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (view === "reserved") {
    return renderReservedContent();
  }

  if (noWallet) {
    return renderNoWallet();
  }

  return renderReceiveContent();
}

type ReservedRowProps = {
  address: WalletReservedAddress;
  onCopy: (value: string) => void;
};

function ReservedRow({ address, onCopy }: ReservedRowProps) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="truncate" title={address.address}>
            {address.address}
          </span>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted",
            )}
            aria-label="Copy address"
            onClick={() => onCopy(address.address)}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </td>
      <td className="py-3 pr-4 text-sm text-foreground">{address.label ?? "—"}</td>
      <td className="py-3 pr-4 text-sm text-foreground">{formatDate(address.reservedAt)}</td>
    </tr>
  );
}
