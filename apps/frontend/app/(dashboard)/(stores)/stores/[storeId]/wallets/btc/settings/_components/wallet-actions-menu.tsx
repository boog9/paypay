"use client";

import { type ReactElement, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Button } from "@/components/ui/button";
import { ConfirmDangerDialog } from "@/components/ui/confirm-danger-dialog";
import { useToast } from "@/components/ui/toast";
import {
  clearBtcWalletHistory,
  pruneBtcWalletHistory,
  removeBtcWallet,
  replaceBtcWallet,
} from "@/lib/api/btc-wallet-actions";

import type { WalletActionId } from "../_lib/get-wallet-actions";

type WalletActionsMenuProps = {
  storeId: string;
  actions: WalletActionId[] | null;
  error?: string | null;
};

type ConfirmableAction = Extract<WalletActionId, "replace" | "remove">;

const ACTION_LABELS: Record<WalletActionId, string> = {
  "prune-history": "Prune old transactions from history",
  "clear-history": "Clear all transactions from history",
  replace: "Replace wallet",
  remove: "Remove wallet",
};

export function WalletActionsMenu({ storeId, actions, error }: WalletActionsMenuProps): ReactElement | null {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<WalletActionId | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmableAction | null>(null);
  const [confirmation, setConfirmation] = useState("");

  const actionList = useMemo(() => {
    if (!Array.isArray(actions)) {
      return [] as WalletActionId[];
    }
    return actions.filter((action): action is WalletActionId => Boolean(ACTION_LABELS[action]));
  }, [actions]);

  const dropdownDisabled = useMemo(() => Boolean(pending), [pending]);

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  if (!actionList.length) {
    return <p className="text-sm text-muted-foreground">No available actions.</p>;
  }

  const resetConfirmation = (): void => {
    setConfirmAction(null);
    setConfirmation("");
  };

  const withToast = async (
    actionId: WalletActionId,
    action: () => Promise<void>,
    success: string
  ): Promise<void> => {
    try {
      setPending(actionId);
      await action();
      toast({ title: success });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Action failed";
      toast({ title: "Action failed", description: message, variant: "destructive" });
      console.error(caught);
    } finally {
      setPending(null);
    }
  };

  const handleImmediateAction = (actionId: WalletActionId): void => {
    if (actionId === "prune-history") {
      void withToast(
        actionId,
        () => pruneBtcWalletHistory(storeId),
        "Pruning started. Historical entries will be reduced."
      );
      return;
    }

    if (actionId === "clear-history") {
      void withToast(
        actionId,
        () => clearBtcWalletHistory(storeId),
        "History cleared. BTCPay will rebuild new activity as it arrives."
      );
    }
  };

  const openConfirm = (actionId: ConfirmableAction): void => {
    setPending(null);
    setConfirmation("");
    setConfirmAction(actionId);
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
        router.push(`/stores/${storeId}/wallets/btc`);
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
            {actionList.map((action) => {
              const label = ACTION_LABELS[action];
              const isDangerous = action === "remove";
              const requiresConfirmation = action === "replace" || action === "remove";

              return (
                <DropdownMenu.Item
                  key={action}
                  className="cursor-pointer select-none rounded-sm px-3 py-2 outline-none hover:bg-muted disabled:opacity-50"
                  disabled={pending === action}
                  onSelect={() => {
                    if (requiresConfirmation) {
                      openConfirm(action);
                      return;
                    }

                    handleImmediateAction(action);
                  }}
                >
                  <span className={isDangerous ? "text-destructive" : undefined}>{label}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDangerDialog
        open={confirmAction === "replace"}
        onCancel={resetConfirmation}
        onConfirm={() => {
          void handleConfirm();
        }}
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
        onConfirm={() => {
          void handleConfirm();
        }}
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
