import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge } from "../../../../../../../components/ui/badge";
import { Button } from "../../../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../components/ui/card";
import { bffFetch } from "../../../../../../../lib/bff-fetch";

export const metadata: Metadata = {
  title: "BTC wallet settings",
};

type WalletSummary = {
  storeId: string;
  paymentMethodId: string;
  enabled: boolean;
  currency: string;
  previewAddresses: string[];
};

type SettingsPageProps = {
  params: Promise<{ storeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePreviewAddressesPayload(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const addresses: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeNonEmptyString(entry);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    addresses.push(normalized);
    if (addresses.length >= 10) {
      break;
    }
  }
  return addresses;
}

function parseWalletSummaryPayload(value: unknown): WalletSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeId = normalizeNonEmptyString(record.storeId);
  const paymentMethodId = normalizeNonEmptyString(record.paymentMethodId);
  const currency = normalizeNonEmptyString(record.currency);
  if (!storeId || !paymentMethodId || !currency) {
    return null;
  }

  const enabled = typeof record.enabled === "boolean" ? record.enabled : false;
  const previewAddresses = normalizePreviewAddressesPayload(record.previewAddresses);

  return {
    storeId,
    paymentMethodId,
    enabled,
    currency,
    previewAddresses,
  } satisfies WalletSummary;
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

async function requestWalletSummary(storeId: string): Promise<Response | null> {
  try {
    return await bffFetch(`/api/stores/${storeId}/wallets/btc`);
  } catch {
    return null;
  }
}

async function attemptSessionRefresh(): Promise<boolean> {
  try {
    const response = await bffFetch("/api/auth/refresh", { method: "POST" });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

async function loadWalletSummary(
  storeId: string
): Promise<{ status: number; data: WalletSummary | null; attemptedRefresh: boolean }> {
  let response = await requestWalletSummary(storeId);
  if (!response) {
    return { status: 0, data: null, attemptedRefresh: false };
  }

  let attemptedRefresh = false;

  if (response.status === 401) {
    attemptedRefresh = true;
    const refreshed = await attemptSessionRefresh();
    if (!refreshed) {
      return { status: 401, data: null, attemptedRefresh };
    }
    response = await requestWalletSummary(storeId);
    if (!response) {
      return { status: 0, data: null, attemptedRefresh };
    }
  }

  const status = response.status;
  const rawBody = await readResponseBody(response);
  const parsed = parseJsonPayload(rawBody);

  return { status, data: parseWalletSummaryPayload(parsed), attemptedRefresh };
}

export default async function WalletSettingsPage({ params, searchParams: _searchParams }: SettingsPageProps) {
  const { storeId } = await params;
  const search = _searchParams ? await _searchParams : undefined;
  const { data: summary, status, attemptedRefresh } = await loadWalletSummary(storeId);

  if (status === 401 && attemptedRefresh) {
    redirect("/sign-in?reason=session-expired");
  }

  const connectedFlag = Array.isArray(search?.connected) ? search?.connected[0] : search?.connected;
  const normalizedConnected = typeof connectedFlag === "string" ? connectedFlag.trim().toLowerCase() : "";
  const wizardConnected = ["1", "true", "yes"].includes(normalizedConnected);

  const isUnauthorized = status === 401 || status === 419;
  const isForbidden = status === 403;
  const isNotFound = status === 404;
  const fetchFailed =
    status !== 0 &&
    status !== 200 &&
    status !== 401 &&
    status !== 403 &&
    status !== 404 &&
    status !== 419;

  const effectiveSummary: WalletSummary | null = status === 200 && summary ? summary : null;
  const previewAddresses = effectiveSummary?.previewAddresses ?? [];

  const showSuccessAlert = wizardConnected && Boolean(effectiveSummary?.enabled);

  const statusMessage = (() => {
    if (isUnauthorized) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Your session has expired. Please sign in again.
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Insufficient permissions to view this wallet. Contact the store administrator to request access.
        </div>
      );
    }

    if (fetchFailed) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Unable to load wallet summary. Try again later or rerun the wallet wizard.
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
          Review the on-chain configuration sourced from BTCPay Server. Sensitive credentials such as extended public keys are never exposed in the dashboard.
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
            The summary below is read-only and omits extended public keys and other sensitive fields by design.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {effectiveSummary ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment method ID
                  </dt>
                  <dd className="text-sm text-foreground">{effectiveSummary.paymentMethodId}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={effectiveSummary.enabled ? "default" : "secondary"}>
                      {effectiveSummary.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</dt>
                  <dd className="text-sm text-foreground">{effectiveSummary.currency}</dd>
                </div>
              </dl>

              <div className="mt-6 space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Recent deposit addresses</h2>
                {previewAddresses.length > 0 ? (
                  <ol className="space-y-2">
                    {previewAddresses.map((address, index) => (
                      <li key={`${address}-${index}`} className="rounded-md border border-muted bg-muted/40 px-3 py-2">
                        <p className="text-sm font-mono text-foreground">{address}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Address preview is not available for this wallet. Rerun the wallet wizard if you recently rotated keys.
                  </p>
                )}
              </div>
            </>
          ) : !statusMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Unable to load wallet summary.
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
