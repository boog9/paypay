import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";

import { Badge } from "../../../../../../../components/ui/badge";
import { Button } from "../../../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../components/ui/card";

export const metadata: Metadata = {
  title: "BTC wallet settings",
};

type WalletMetadata = {
  label: string | null;
  accountKeyPath: string | null;
  hasDerivationScheme: boolean;
  hasMasterFingerprint: boolean;
};

type WalletAddressPreview = {
  address: string;
  keyPath: string | null;
  index: number | null;
};

type WalletStatus = {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  enabled: boolean;
  connected: boolean;
  missingLocalMeta: boolean;
  metadata: WalletMetadata;
  addressPreview: WalletAddressPreview[];
};

type SettingsPageProps = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const API_PREFIX = "/api";

function resolveBffApiBaseUrl(): string | null {
  const rawBaseUrl = process.env.NEXT_PUBLIC_BFF_URL;
  if (!rawBaseUrl) {
    return API_PREFIX;
  }

  try {
    const parsed = new URL(rawBaseUrl);
    const origin = parsed.origin.replace(/\/$/, "");
    return `${origin}${API_PREFIX}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAddressPreviewPayload(value: unknown): WalletAddressPreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const address = normalizeOptionalString(record.address);
  if (!address) {
    return null;
  }
  const keyPath = normalizeOptionalString(record.keyPath);
  const indexValue = record.index;
  const index = typeof indexValue === "number" && Number.isFinite(indexValue)
    ? Math.trunc(indexValue)
    : null;

  return { address, keyPath, index } satisfies WalletAddressPreview;
}

function normalizeWalletStatusPayload(value: unknown): WalletStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeId = normalizeOptionalString(record.storeId);
  const currency = normalizeOptionalString(record.currency);
  const paymentMethodId = normalizeOptionalString(record.paymentMethodId);
  if (!storeId || !currency || !paymentMethodId) {
    return null;
  }

  const enabled = normalizeBoolean(record.enabled, false);
  const connected = normalizeBoolean(record.connected, enabled);
  const missingLocalMeta = normalizeBoolean(record.missingLocalMeta, false);

  const metadataRecord = record.metadata;
  let metadata: WalletMetadata = {
    label: null,
    accountKeyPath: null,
    hasDerivationScheme: false,
    hasMasterFingerprint: false,
  };
  if (metadataRecord && typeof metadataRecord === "object" && !Array.isArray(metadataRecord)) {
    const metadataRaw = metadataRecord as Record<string, unknown>;
    metadata = {
      label: normalizeOptionalString(metadataRaw.label),
      accountKeyPath: normalizeOptionalString(metadataRaw.accountKeyPath),
      hasDerivationScheme: normalizeBoolean(metadataRaw.hasDerivationScheme, false),
      hasMasterFingerprint: normalizeBoolean(metadataRaw.hasMasterFingerprint, false),
    } satisfies WalletMetadata;
  }

  const addressesRaw = Array.isArray(record.addressPreview) ? record.addressPreview : [];
  const addressPreview = addressesRaw
    .map((entry) => normalizeAddressPreviewPayload(entry))
    .filter((entry): entry is WalletAddressPreview => entry !== null);

  return {
    storeId,
    currency,
    paymentMethodId,
    enabled,
    connected,
    missingLocalMeta,
    metadata,
    addressPreview,
  } satisfies WalletStatus;
}

async function readResponseBody(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function parseJsonPayload(raw: string | null): unknown {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

async function fetchWalletStatusResponse(storeId: string): Promise<Response | null> {
  const baseUrl = resolveBffApiBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const url = `${baseUrl}/stores/${storeId}/wallets/btc`;

  try {
    const cookieStore = await cookies();
    const serializedCookies = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (serializedCookies) {
      headers.set("Cookie", serializedCookies);
    }

    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers,
      credentials: "include",
      mode: "cors",
    });
  } catch {
    return null;
  }
}

async function loadWalletStatus(storeId: string): Promise<{ status: number; data: WalletStatus | null }> {
  const response = await fetchWalletStatusResponse(storeId);
  if (!response) {
    return { status: 0, data: null };
  }

  const status = response.status;
  const rawBody = await readResponseBody(response);
  const parsed = parseJsonPayload(rawBody);

  return { status, data: normalizeWalletStatusPayload(parsed) };
}

function resolveSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
}

export default async function WalletSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { storeId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const connectedParam = resolveSearchParam(resolvedSearchParams?.connected);
  const connectedFromQuery = connectedParam === "1";

  const { data: wallet, status } = await loadWalletStatus(storeId);

  const isUnauthorized = status === 401 || status === 419;
  const isForbidden = status === 403;
  const isNotFound = status === 404;
  const fetchFailed = !wallet && !isForbidden && !isUnauthorized && !isNotFound && status !== 0;
  const missingLocalMeta = wallet?.missingLocalMeta ?? false;
  const hasPreview = (wallet?.addressPreview.length ?? 0) > 0;

  const effectiveWallet: WalletStatus | null = wallet ?? (isForbidden
    ? {
        storeId,
        currency: "BTC",
        paymentMethodId: "BTC-CHAIN",
        enabled: true,
        connected: true,
        missingLocalMeta: false,
        metadata: {
          label: null,
          accountKeyPath: null,
          hasDerivationScheme: true,
          hasMasterFingerprint: true,
        },
        addressPreview: [],
      }
    : null);

  const showSuccessAlert = connectedFromQuery || Boolean(wallet?.connected) || isForbidden;

  const statusMessage = (() => {
    if (isUnauthorized) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Missing/expired session або недостатні права. Перелогіньтесь.
        </div>
      );
    }

    if (isNotFound) {
      return (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-900">
          On-chain BTC payment method is not enabled. Run the wallet wizard to connect a wallet.
        </div>
      );
    }

    if (isForbidden) {
      return (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900">
          Wallet connected. Detailed configuration is hidden because BTCPay returned limited permissions.
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
          Review the on-chain configuration sourced from BTCPay Server. Extended public keys remain hidden for security.
        </p>
      </header>

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

      {statusMessage}

      <Card className="border border-muted">
        <CardHeader>
          <CardTitle className="text-lg">On-chain BTC payment method</CardTitle>
          <CardDescription>
            These values are read-only. Updates must be made through the BTCPay UI or the wallet wizard. Sensitive fields
            such as extended public keys are never displayed in this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {effectiveWallet ? (
            <>
              {missingLocalMeta && !isForbidden && (
                <div className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-900">
                  Local wallet metadata is missing. Run the wallet wizard again to resync this configuration.
                </div>
              )}

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment method ID
                  </dt>
                  <dd className="text-sm text-foreground">{effectiveWallet.paymentMethodId}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={effectiveWallet.enabled ? "default" : "secondary"}>
                      {effectiveWallet.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</dt>
                  <dd className="text-sm text-foreground">{effectiveWallet.metadata.label ?? "Not set"}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account key path</dt>
                  <dd className="text-sm font-mono text-foreground">
                    {effectiveWallet.metadata.accountKeyPath ?? "Not provided"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Extended public key
                  </dt>
                  <dd className="text-sm text-foreground">
                    {effectiveWallet.metadata.hasDerivationScheme ? "Stored securely on BTCPay" : "Not available"}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Master fingerprint
                  </dt>
                  <dd className="text-sm text-foreground">
                    {effectiveWallet.metadata.hasMasterFingerprint ? "Stored securely on BTCPay" : "Not available"}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Recent deposit addresses</h2>
                {hasPreview ? (
                  <ol className="space-y-2">
                    {effectiveWallet.addressPreview.map((item, index) => (
                      <li key={`${item.address}-${index}`} className="rounded-md border border-muted bg-muted/40 px-3 py-2">
                        <p className="text-sm font-mono text-foreground">{item.address}</p>
                        {item.keyPath && (
                          <p className="text-xs text-muted-foreground">Derivation path: {item.keyPath}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Address preview is not available. Run the wallet wizard again if you suspect the derivation is outdated.
                  </p>
                )}
              </div>
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
