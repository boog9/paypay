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
  storeId: string;
  enabled: boolean;
  paymentMethodId: string;
  currency: string;
  connected: boolean;
  missingLocalMeta: boolean;
  config: {
    derivationScheme: string | null;
    accountKeyPath: string | null;
    masterFingerprint: string | null;
    label: string | null;
  };
};

type SettingsPageProps = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

  const storeId = normalizeOptionalString(record.storeId);
  const paymentMethodId = normalizeOptionalString(record.paymentMethodId);
  const currency = normalizeOptionalString(record.currency);

  if (!storeId || !paymentMethodId || !currency) {
    return null;
  }

  const connected = typeof record.connected === "boolean" ? record.connected : record.enabled;
  const missingLocalMeta = typeof record.missingLocalMeta === "boolean" ? record.missingLocalMeta : false;

  const configRecord =
    record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};

  return {
    storeId,
    enabled: record.enabled,
    paymentMethodId,
    currency,
    connected,
    missingLocalMeta,
    config: {
      derivationScheme: normalizeOptionalString(configRecord.derivationScheme),
      accountKeyPath: normalizeOptionalString(configRecord.accountKeyPath),
      masterFingerprint: normalizeOptionalString(configRecord.masterFingerprint),
      label: normalizeOptionalString(configRecord.label),
    },
  } satisfies WalletConfig;
}

async function loadWalletConfig(storeId: string): Promise<{ config: WalletConfig | null; status: number }> {
  try {
    const response = await fetchFromBff(`/stores/${storeId}/wallets/btc`, { method: "GET" });
    const status = response.status;
    if (!response.ok) {
      return { config: null, status };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { config: null, status };
    }
    return { config: normalizeWalletConfigPayload(payload), status };
  } catch {
    return { config: null, status: 0 };
  }
}

export default async function WalletSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { storeId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const connected = Array.isArray(resolvedSearchParams?.connected)
    ? resolvedSearchParams?.connected.includes("1")
    : resolvedSearchParams?.connected === "1";

  const { config, status } = await loadWalletConfig(storeId);
  const authError = status === 401 || status === 403;
  const fetchFailed = !authError && !config && status !== 0;
  const missingLocalMeta = config?.missingLocalMeta ?? false;

  const statusMessage = (() => {
    if (authError) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Missing/expired session або недостатні права. Перелогіньтесь.
        </div>
      );
    }
    if (config && !config.enabled) {
      return (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-900">
          On-chain BTC payment method не увімкнено. Запустіть майстер ще раз.
        </div>
      );
    }
    if (fetchFailed) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load wallet configuration. Run the wallet wizard again.
        </div>
      );
    }
    return null;
  })();

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

      {statusMessage}

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
            <>
              {missingLocalMeta && (
                <div className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-900">
                  Local wallet metadata is missing. Run the wallet wizard again to resync this configuration.
                </div>
              )}
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
                    {config.config.derivationScheme ?? "Not configured"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Account key path
                  </dt>
                  <dd className="text-sm font-mono text-foreground">
                    {config.config.accountKeyPath ?? "Not provided"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Master fingerprint
                  </dt>
                  <dd className="text-sm font-mono text-foreground">
                    {config.config.masterFingerprint ?? "Not available"}
                  </dd>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</dt>
                  <dd className="text-sm text-foreground">{config.config.label ?? "Not set"}</dd>
                </div>
              </dl>
            </>
          ) : !statusMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Unable to load wallet configuration.
            </div>
          ) : null}
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
