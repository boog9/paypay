import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BitcoinWalletSettingsViewModel } from "../_lib/get-wallet-settings";

type WalletSettingsPanelProps = {
  viewModel: BitcoinWalletSettingsViewModel | null;
  showBanner: boolean;
  errorMessage?: string | null;
  showSuccessAlert?: boolean;
};

export function WalletSettingsPanel({ viewModel, showBanner, errorMessage, showSuccessAlert }: WalletSettingsPanelProps) {
  const showEmptyState = !viewModel?.hasOnChainPaymentMethod;
  const statusLabel = (() => {
    if (!viewModel) {
      return null;
    }
    return viewModel.enabled ? "Enabled" : "Disabled";
  })();

  return (
    <div className="space-y-6">
      {showSuccessAlert && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900">
          The wallet was connected successfully. Review the
          <Link
            className="ml-1 font-medium underline"
            href="https://docs.btcpayserver.org/WalletSetup/"
            target="_blank"
            rel="noreferrer"
          >
            BTCPay wallet documentation
          </Link>
          &nbsp;to confirm the derivation matches your external wallet.
        </div>
      )}

      {showBanner && (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-900" role="alert">
          On-chain BTC payment method is not enabled. Run the wallet wizard to connect a wallet.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </div>
      )}

      <Card className="border border-muted">
        <CardHeader>
          <CardTitle className="text-lg">On-chain BTC payment method</CardTitle>
          <CardDescription>
            Review non-sensitive metadata sourced directly from BTCPay Server. Fields are read-only and never expose extended public keys or private keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showEmptyState && (
            <p className="text-sm text-muted-foreground">
              No on-chain BTC wallet is connected to this store.
            </p>
          )}

          {!showEmptyState && viewModel && (
            <div className="space-y-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="flex items-center gap-3">
                    {statusLabel && (
                      <Badge variant={viewModel.enabled ? "default" : "secondary"}>{statusLabel}</Badge>
                    )}
                    {!viewModel.enabled && (
                      <span className="text-sm text-muted-foreground">This payment method is disabled in BTCPay.</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                {viewModel.accountKeyPath && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Account key path</p>
                    <p className="text-sm font-mono text-foreground">{viewModel.accountKeyPath}</p>
                  </div>
                )}
                {viewModel.masterFingerprint && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Master fingerprint</p>
                    <p className="text-sm font-mono text-foreground">{viewModel.masterFingerprint}</p>
                  </div>
                )}
              </div>

              {viewModel.label && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Label</p>
                  <p className="text-sm text-foreground">{viewModel.label}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
