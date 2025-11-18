"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDangerDialog } from "@/components/ui/confirm-danger-dialog";
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

type ConfirmableAction = "replace" | "remove" | null;

export function WalletActions({ tenantId, storeId, enabled }: WalletActionsProps): JSX.Element | null {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmableAction>(null);
  const [confirmation, setConfirmation] = useState("");

  const dropdownDisabled = useMemo(() => Boolean(pending), [pending]);

  if (!enabled) {
    return null;
  }

  const resetConfirmation = (): void => {
    setConfirmAction(null);
    setConfirmation("");
  };

  const goToRescan = (): void => {
    router.push(`/tenants/${tenantId}/stores/${storeId}/wallets/bitcoin/rescan`);
  };

  const withToast = async (label: string, action: () => Promise<void>, success: string): Promise<void> => {
    try {
      setPending(label);
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

  const openConfirm = (action: Exclude<ConfirmableAction, null>): void => {
    setPending(null);
    setConfirmation("");
    setConfirmAction(action);
  };

  const handleConfirm = async (): Promise<void> => {
    if (!confirmAction) return;

    if (confirmAction === "replace") {
      await withToast(
        "replace",
        () => replaceBtcWallet(storeId),
        "Wallet cleared. Configure a new on-chain wallet in BTCPay."
      );
      resetConfirmation();
      return;
    }

    await withToast(
      "remove",
      async () => {
        await removeBtcWallet(storeId);
        router.push(`/tenants/${tenantId}/stores/${storeId}`);
      },
      "Wallet removed. Configure a new wallet to resume on-chain payments."
    );
    resetConfirmation();
  };

  return (
    <div className="inline-flex items-center gap-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={dropdownDisabled} aria-label="Wallet actions">
          <Button variant="secondary" size="sm" aria-haspopup="menu" disabled={dropdownDisabled}>
            {pending ? "Working…" : "Actions"}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-20 w-72 rounded-md border bg-popover p-1 text-sm shadow-lg" align="end">
            <DropdownMenu.Item
              className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted"
              onSelect={goToRescan}
            >
              Rescan wallet for missing transactions
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted disabled:opacity-50"
              disabled={pending === "prune"}
              onSelect={pruneHistory}
            >
              Prune old transactions from history
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted disabled:opacity-50"
              disabled={pending === "clear"}
              onSelect={clearHistory}
            >
              Clear all transactions from history
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted disabled:opacity-50"
              disabled={pending === "replace"}
              onSelect={() => openConfirm("replace")}
            >
              Replace wallet
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer select-none rounded-sm px-3 py-2 text-destructive outline-none hover:bg-destructive/10 disabled:opacity-50"
              disabled={pending === "remove"}
              onSelect={() => openConfirm("remove")}
            >
              Remove wallet
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDangerDialog
        open={confirmAction === "replace"}
        onCancel={resetConfirmation}
        onConfirm={handleConfirm}
        value={confirmation}
        onValueChange={setConfirmation}
        keyword="REPLACE"
        confirmLabel="Replace wallet"
        pendingLabel={pending === "replace" ? "Replacing…" : null}
        title="Replace watch-only wallet"
        description={
          <>
            <p className="mb-2">
              This is a watch-only wallet. Private keys remain outside the portal and BTCPay.
            </p>
            <p>
              Replacing will wipe the current configuration and the store will stop receiving on-chain BTC until a new wallet is
              configured.
            </p>
          </>
        }
      />

      <ConfirmDangerDialog
        open={confirmAction === "remove"}
        onCancel={resetConfirmation}
        onConfirm={handleConfirm}
        value={confirmation}
        onValueChange={setConfirmation}
        keyword="REMOVE"
        confirmLabel="Remove wallet"
        pendingLabel={pending === "remove" ? "Removing…" : null}
        title="Remove on-chain wallet"
        description={
          <>
            <p className="mb-2">Removing will detach the wallet configuration from this store.</p>
            <p>The store will stop receiving on-chain BTC until a new wallet is configured.</p>
          </>
        }
      />
    </div>
  );
}
