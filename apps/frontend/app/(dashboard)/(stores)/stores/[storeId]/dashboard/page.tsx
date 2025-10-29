'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../components/ui/card";
import { Button } from "../../../../../../components/ui/button";

type WalletConnectionState = "unknown" | "connected" | "disconnected";

async function fetchWalletConnection(storeId: string): Promise<WalletConnectionState> {
  if (!storeId) {
    return "unknown";
  }

  try {
    const response = await fetch(`/api/stores/${storeId}/wallets/btc?ts=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      const payload = (await response.json()) as { hasWallet?: unknown } | null;
      if (payload && typeof payload === "object" && "hasWallet" in payload) {
        return payload.hasWallet === true ? "connected" : "disconnected";
      }
      return "connected";
    }

    if (response.status === 404) {
      return "disconnected";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function StoreDashboardPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params?.storeId ?? "";
  const [walletState, setWalletState] = useState<WalletConnectionState>("unknown");

  useEffect(() => {
    let cancelled = false;

    if (!storeId) {
      setWalletState("unknown");
      return () => {
        cancelled = true;
      };
    }

    void fetchWalletConnection(storeId).then((state) => {
      if (!cancelled) {
        setWalletState(state);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const walletConnected = walletState === "connected";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Store dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Review the initial setup tasks for your BTCPay store. You can revisit this dashboard anytime from the sidebar.
        </p>
      </header>

      <section aria-label="Store setup" className="grid gap-4 md:grid-cols-2">
        <Card className="border border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
              <CheckCircle2 aria-hidden className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Create your store</CardTitle>
              <CardDescription className="mt-1 text-emerald-700 dark:text-emerald-400">
                Your store is live and connected to BTCPay. Invite teammates and customize settings from the sidebar.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        {walletConnected ? (
          <Card className="border border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="flex flex-row items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
                <Wallet aria-hidden className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Wallet set up</CardTitle>
                <CardDescription className="mt-1 text-emerald-700 dark:text-emerald-400">
                  Your Bitcoin wallet is connected. You can manage it from the wallet menu.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" disabled={!storeId}>
                <Link href={storeId ? `/stores/${storeId}/wallets/btc/transactions` : "#"}>Open BTC wallet</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-muted bg-background">
            <CardHeader className="flex flex-row items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wallet aria-hidden className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Set up a wallet</CardTitle>
                <CardDescription className="mt-1">
                  Connect or generate a Bitcoin wallet to receive settlement from invoices issued by this store.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" disabled={!storeId}>
                <Link href={storeId ? `/stores/${storeId}/wallets/btc/wizard` : "#"}>Go to BTC wallet</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
