import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WalletSettingsPanel } from "./_components/wallet-settings-panel";
import { WalletActionsMenu } from "./_components/wallet-actions-menu";
import { getWalletSettings } from "./_lib/get-wallet-settings";
import { getWalletActions } from "./_lib/get-wallet-actions";

export const metadata: Metadata = {
  title: "BTC wallet settings",
};

type SettingsPageProps = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeStoreId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { storeId } = await params;
  const search = searchParams ? await searchParams : undefined;

  const normalizedStoreId = normalizeStoreId(storeId);
  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const connectedFlag = search?.connected;
  const normalizedConnected = Array.isArray(connectedFlag)
    ? connectedFlag[0]?.toString().trim().toLowerCase()
    : typeof connectedFlag === "string"
      ? connectedFlag.trim().toLowerCase()
      : "";

  const [settings, actions] = await Promise.all([
    getWalletSettings(normalizedStoreId),
    getWalletActions(normalizedStoreId),
  ]);

  if (
    settings.status === 401 ||
    settings.status === 419 ||
    actions.status === 401 ||
    actions.status === 419
  ) {
    redirect("/sign-in?reason=session-expired");
  }

  const viewModel = settings.data;
  const isForbidden = settings.status === 403;
  const isServerError = settings.status >= 500;
  const fetchFailed = settings.status !== 200 && settings.status !== 404 && settings.status !== 403;
  const showBanner = viewModel ? !viewModel.hasOnChainPaymentMethod || viewModel.enabled === false : false;
  const showSuccessAlert = ["1", "true", "yes"].includes(normalizedConnected) && viewModel?.hasOnChainPaymentMethod;
  const actionsError = actions.status === 200 ? null : actions.error;
  const error = settings.error;

  const errorMessage = (() => {
    if (isForbidden) {
      return "Insufficient permissions to view this wallet. Contact the store administrator to request access.";
    }

    if (isServerError) {
      return "Unable to load wallet settings. Try again later.";
    }

    if (fetchFailed) {
      return error ?? null;
    }

    return null;
  })();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Bitcoin wallet settings</h1>
          <p className="text-sm text-muted-foreground">
            Review the on-chain configuration sourced from BTCPay Server. Sensitive credentials such as extended public keys are
            never exposed in the dashboard.
          </p>
        </div>
        <WalletActionsMenu storeId={normalizedStoreId} actions={actions.data} error={actionsError} />
      </header>

      <WalletSettingsPanel
        viewModel={viewModel}
        showBanner={showBanner}
        errorMessage={errorMessage}
        showSuccessAlert={Boolean(showSuccessAlert)}
      />
    </div>
  );
}
