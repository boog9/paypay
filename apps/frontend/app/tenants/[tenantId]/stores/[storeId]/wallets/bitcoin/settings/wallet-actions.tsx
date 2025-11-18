"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  clearBtcWalletHistory,
  pruneBtcWalletHistory,
  removeBtcWallet,
  replaceBtcWallet
} from "@/lib/api/btc-wallet-actions";

interface WalletActionsProps {
  tenantId: string;
  storeId: string;
  enabled: boolean;
}

export function WalletActions({ tenantId, storeId, enabled }: WalletActionsProps): JSX.Element | null {
  const router = useRouter();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  if (!enabled) {
    return null;
  }

  const goToRescan = (): void => {
    setMenuOpen(false);
    router.push(`/tenants/${tenantId}/stores/${storeId}/wallets/bitcoin/rescan`);
  };

  const withToast = async (label: string, action: () => Promise<void>, success: string): Promise<void> => {
    try {
      setPending(label);
      setMenuOpen(false);
      await action();
      toast({ title: success });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed";
      toast({ title: "Action failed", description: message, variant: "destructive" });
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      setPending(null);
    }
  };

  const confirmText = async (expected: string, message: string): Promise<boolean> => {
    const input = window.prompt(message);
    return input?.trim().toUpperCase() === expected;
  };

  const pruneHistory = (): Promise<void> =>
    withToast(
      "prune",
      () => pruneBtcWalletHistory(storeId),
      "Pruning started. Historical entries will be reduced."
    );

  const clearHistory = (): Promise<void> =>
    withToast(
      "clear",
      () => clearBtcWalletHistory(storeId),
      "History cleared. BTCPay will rebuild new activity as it arrives."
    );

  const replaceWallet = async (): Promise<void> => {
    const ok = await confirmText(
      "REPLACE",
      "Type REPLACE to confirm wiping the current watch-only wallet configuration."
    );
    if (!ok) return;
    await withToast(
      "replace",
      () => replaceBtcWallet(storeId),
      "Wallet cleared. Configure a new on-chain wallet in BTCPay."
    );
  };

  const removeWallet = async (): Promise<void> => {
    const ok = await confirmText(
      "REMOVE",
      "Type REMOVE to detach the on-chain wallet. The store will stop receiving BTC on-chain until reconfigured."
    );
    if (!ok) return;
    await withToast(
      "remove",
      async () => {
        await removeBtcWallet(storeId);
        router.push(`/tenants/${tenantId}/stores/${storeId}`);
      },
      "Wallet removed. Configure a new wallet to resume on-chain payments."
    );
  };

  return (
    <div className="relative inline-flex">
      <Button variant="secondary" size="sm" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu">
        Actions
      </Button>
      {menuOpen ? (
        <div className="absolute right-0 top-10 z-10 w-64 rounded-md border bg-popover text-sm shadow-lg">
          <ul className="divide-y">
            <li>
              <button className="block w-full px-4 py-2 text-left hover:bg-muted" onClick={goToRescan}>
                Rescan wallet for missing transactions
              </button>
            </li>
            <li>
              <button
                className="block w-full px-4 py-2 text-left hover:bg-muted disabled:opacity-50"
                onClick={pruneHistory}
                disabled={pending === "prune"}
              >
                Prune old transactions from history
              </button>
            </li>
            <li>
              <button
                className="block w-full px-4 py-2 text-left hover:bg-muted disabled:opacity-50"
                onClick={clearHistory}
                disabled={pending === "clear"}
              >
                Clear all transactions from history
              </button>
            </li>
            <li>
              <button
                className="block w-full px-4 py-2 text-left hover:bg-muted disabled:opacity-50"
                onClick={replaceWallet}
                disabled={pending === "replace"}
              >
                Replace wallet
              </button>
            </li>
            <li>
              <button
                className="block w-full px-4 py-2 text-left text-destructive hover:bg-destructive/10 disabled:opacity-50"
                onClick={removeWallet}
                disabled={pending === "remove"}
              >
                Remove wallet
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
