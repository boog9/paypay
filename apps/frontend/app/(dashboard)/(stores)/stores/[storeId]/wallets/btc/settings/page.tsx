import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { Badge } from "../../../../../../../../components/ui/badge";
import { Button } from "../../../../../../../../components/ui/button";
import { fetchFromBff } from "../../../../../../../../lib/server-api";

export const metadata: Metadata = {
  title: "BTC wallet settings",
};

type WalletConfig = {
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
  paymentMethodId: string;
  currency: string;
  cryptoCode: string;
};

type SettingsPageProps = {
  params: { storeId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWalletConfigPayload(value: unknown): WalletConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;

  if (typeof record.enabled !== "boolean") {
    return null;
  }

  const paymentMethodId = normalizeOptionalString(record.paymentMethodId);
  const currency = normalizeOptionalString(record.currency);
  const cryptoCode = normalizeOptionalString(record.cryptoCode);

  if (!paymentMethodId || !currency || !cryptoCode) {
    return null;
  }

  return {
    enabled: record.enabled,
    derivationScheme: normalizeOptionalString(record.derivationScheme),
    accountKeyPath: normalizeOptionalString(record.accountKeyPath),
    masterFingerprint: normalizeOptionalString(record.masterFingerprint),
    label: normalizeOptionalString(record.label),
    paymentMethodId,
    currency,
    cryptoCode,
  } satisfies WalletConfig;
}

async function loadWalletConfig(storeId: string): Promise<WalletConfig | null> {
  try {
    const response = await fetchFromBff(`/stores/${storeId}/wallets/btc`, { method: "GET" });
    if (!response.ok) {
      return null;
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }
    return normalizeWalletConfigPayload(payload);
  } catch {
    return null;
  }
}

export default async function WalletSettingsPage({ params, searchParams }: SettingsPageProps) {
  const storeId = params.storeId;
  const connected = Array.isArray(searchParams?.connected)
    ? searchParams?.connected.includes("1")
    : searchParams?.connected === "1";

  const config = await loadWalletConfig(storeId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Bitcoin wallet settings</h1>
        <p className="text-sm text-muted-foreground">
          Review the on-chain configuration sourced from BTCPay Server. Account key paths follow the guidance
          from the official wallet documentation so PSBT signing remains compatible.
        </p>
      </header>

      {connected && (
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

      <Card className="border border-muted">
        <CardHeader>
          <CardTitle className="text-lg">On-chain BTC payment method</CardTitle>
          <CardDescription>
            These values are read-only. Updates must be made through the BTCPay UI or the wallet wizard. Learn
            more about account key paths in the
            <Link
              className="ml-1 font-medium text-primary hover:underline"
              href="https://docs.btcpayserver.org/WalletSetup/"
              target="_blank"
              rel="noreferrer"
            >
              BTCPay wallet documentation
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment method ID
                </dt>
                <dd className="text-sm text-foreground">{config.paymentMethodId}</dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={config.enabled ? "default" : "secondary"}>
                    {config.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </dd>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Derivation scheme
                </dt>
                <dd className="text-sm font-mono text-foreground">
                  {config.derivationScheme ?? "Not configured"}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Account key path
                </dt>
                <dd className="text-sm font-mono text-foreground">
                  {config.accountKeyPath ?? "Not provided"}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Master fingerprint
                </dt>
                <dd className="text-sm font-mono text-foreground">
                  {config.masterFingerprint ?? "Not available"}
                </dd>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</dt>
                <dd className="text-sm text-foreground">{config.label ?? "Not set"}</dd>
              </div>
            </dl>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Unable to load wallet configuration from BTCPay. Verify that the store has an on-chain payment
              method configured and that your API key includes the store settings scope.
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="secondary">
          <Link href={`/stores/${storeId}/wallets/btc/wizard`}>Run wallet wizard again</Link>
        </Button>
      </div>
    </div>
  );
}
