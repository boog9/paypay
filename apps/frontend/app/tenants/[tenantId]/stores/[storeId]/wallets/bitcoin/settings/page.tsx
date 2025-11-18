import type { ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bffFetch } from "@/lib/bff-fetch";
import { WalletActions } from "./wallet-actions";

interface PageParams {
  tenantId: string;
  storeId: string;
}

interface WalletMetadataResponse {
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
}

async function loadWalletMetadata(storeId: string): Promise<{ data: WalletMetadataResponse | null; error: boolean }> {
  try {
    const response = await bffFetch(`/api/stores/${storeId}/wallets/bitcoin`);
    if (!response.ok) {
      return { data: null, error: true };
    }
    const payload = (await response.json()) as WalletMetadataResponse;
    return { data: payload, error: false };
  } catch {
    return { data: null, error: true };
  }
}

function renderDerivationStatus(metadata: WalletMetadataResponse | null): string {
  if (!metadata?.enabled) {
    return "Wallet disabled";
  }
  if (metadata.derivationScheme === "PRESENT") {
    return "Configured (descriptor hidden for security)";
  }
  return "Not configured";
}

export default async function SettingsPage({
  params
}: {
  params: Promise<PageParams>;
}): Promise<ReactElement> {
  const { storeId, tenantId } = await params;
  const { data, error } = await loadWalletMetadata(storeId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Settings</CardTitle>
        <WalletActions tenantId={tenantId} storeId={storeId} enabled={Boolean(data?.enabled)} />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            Не вдалося завантажити налаштування гаманця. Спробуйте пізніше.
          </div>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Wallet status</dt>
            <dd className="text-foreground">{data?.enabled ? "Enabled" : "Disabled"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Label</dt>
            <dd className="text-foreground">{data?.label ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Derivation scheme</dt>
            <dd className="text-foreground">{renderDerivationStatus(data)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Master fingerprint</dt>
            <dd className="text-foreground">{data?.masterFingerprint ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Account key path</dt>
            <dd className="text-foreground">{data?.accountKeyPath ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Wallet descriptors and extended public keys remain encrypted in BTCPay Server and are not stored within the
          portal. Reconfigure the wallet from this page to update metadata synced with BTCPay.
        </p>
      </CardContent>
    </Card>
  );
}
