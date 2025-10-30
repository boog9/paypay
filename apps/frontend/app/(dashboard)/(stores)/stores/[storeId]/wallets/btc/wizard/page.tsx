"use client";

import { ChangeEvent, FormEvent, use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../../../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { Input } from "../../../../../../../../components/ui/input";
import { ApiError, api, apiPost, isApiError } from "../../../../../../../../lib/api";
import { useToast } from "../../../../../../../../components/ui/toast";
import { getCsrfToken } from "../../../../../../../../lib/auth";
import { detectNetworkFromInput, resolveInstanceNetwork, walletWizardFormSchema } from "./validation";

type WizardStep = "connect" | "enter" | "confirm";

type PreviewAddress = {
  address: string;
  keyPath: string | null;
  index: number | null;
};

type PreviewResponse = {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  addresses: PreviewAddress[];
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePreviewAddressPayload(value: unknown): PreviewAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const address = normalizeNonEmptyString(record.address);
  if (!address) {
    return null;
  }

  const indexValue = record.index;
  const index = typeof indexValue === "number" && Number.isFinite(indexValue)
    ? Math.trunc(indexValue)
    : null;

  return {
    address,
    keyPath: normalizeNonEmptyString(record.keyPath),
    index,
  } satisfies PreviewAddress;
}

function normalizePreviewResponsePayload(value: unknown): PreviewResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeId = normalizeNonEmptyString(record.storeId);
  const currency = normalizeNonEmptyString(record.currency);
  const paymentMethodId = normalizeNonEmptyString(record.paymentMethodId);

  if (!storeId || !currency || !paymentMethodId) {
    return null;
  }

  const addressesRaw = Array.isArray(record.addresses) ? record.addresses : [];
  const addresses = addressesRaw
    .map((item) => normalizePreviewAddressPayload(item))
    .filter((item): item is PreviewAddress => item !== null);

  return {
    storeId,
    currency,
    paymentMethodId,
    addresses,
  } satisfies PreviewResponse;
}

function containsExtendedKeySnippet(value: string): boolean {
  return /(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{10,}/i.test(value);
}

function sanitizePreviewMessage(value: string): string {
  return value.replace(/\p{Cc}+/gu, " ").trim();
}

function extractMessageFromBody(body: unknown): string | null {
  if (typeof body === "string") {
    const sanitized = sanitizePreviewMessage(body);
    return sanitized.length > 0 ? sanitized : null;
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const candidates: unknown[] = [record.message, record.error];
    if (Array.isArray(record.errors)) {
      for (const entry of record.errors) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const candidate = (entry as Record<string, unknown>).message ?? (entry as Record<string, unknown>).error;
          candidates.push(candidate);
        }
      }
    }
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const sanitized = sanitizePreviewMessage(candidate);
        if (sanitized.length > 0) {
          return sanitized;
        }
      }
    }
  }
  return null;
}

function normalizePreviewErrorMessage(error: ApiError): string {
  const fallback = "Failed to preview derivation scheme.";
  const bodyMessage = extractMessageFromBody(error.body);
  if (bodyMessage && !containsExtendedKeySnippet(bodyMessage)) {
    return bodyMessage;
  }

  const sanitized = typeof error.message === "string" ? sanitizePreviewMessage(error.message) : "";
  if (sanitized.length > 0 && !containsExtendedKeySnippet(sanitized)) {
    return sanitized;
  }

  return fallback;
}

const INSTANCE_NETWORK = resolveInstanceNetwork(process.env.NEXT_PUBLIC_BTCPAY_NETWORK);

type FormErrors = Partial<Record<"derivationScheme" | "accountKeyPath", string>>;

type WizardProps = {
  params: Promise<{ storeId: string }>;
};

export default function WalletWizardPage({ params }: WizardProps) {
  const { storeId } = use(params);
  const router = useRouter();
  const toastContext = useToast();

  const [step, setStep] = useState<WizardStep>("connect");
  const [derivationScheme, setDerivationScheme] = useState("");
  const [accountKeyPath, setAccountKeyPath] = useState<string | undefined>(undefined);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const addresses = useMemo(() => preview?.addresses ?? [], [preview]);
  const derivedNetwork = useMemo(() => detectNetworkFromInput(derivationScheme), [derivationScheme]);
  const networkWarning = useMemo(() => {
    if (!INSTANCE_NETWORK || !derivedNetwork) {
      return null;
    }
    if (INSTANCE_NETWORK === derivedNetwork) {
      return null;
    }
    return `This key looks like it belongs to ${derivedNetwork}, but the BTCPay instance is ${INSTANCE_NETWORK}. Preview may fail if they do not match.`;
  }, [derivedNetwork]);

  const handleDerivationChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDerivationScheme(event.currentTarget.value);
  }, []);

  const handleAccountKeyPathChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setAccountKeyPath(nextValue.length > 0 ? nextValue : undefined);
  }, []);

  const showTestnetAccountHint = useMemo(() => {
    const trimmedScheme = derivationScheme.trim().toLowerCase();
    const hasAccountPath = typeof accountKeyPath === "string" && accountKeyPath.trim().length > 0;
    return trimmedScheme.startsWith("tpub") && !hasAccountPath;
  }, [accountKeyPath, derivationScheme]);

  const showTestnetAddressHint = useMemo(() => {
    if (INSTANCE_NETWORK === "testnet" || derivedNetwork === "testnet") {
      return true;
    }

    return addresses.some((item) => item.address.toLowerCase().startsWith("tb1"));
  }, [addresses, derivedNetwork]);

  const handleStart = useCallback(() => {
    setStep("enter");
    setFormError(null);
    setFormErrors({});
  }, []);

  const handlePreview = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setFormError(null);
    setFormErrors({});

    const parsed = walletWizardFormSchema.safeParse({ derivationScheme, accountKeyPath });
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      const fieldErrors = parsed.error.flatten().fieldErrors;
      if (fieldErrors.derivationScheme?.length) {
        nextErrors.derivationScheme = fieldErrors.derivationScheme[0] ?? null;
      }
      if (fieldErrors.accountKeyPath?.length) {
        nextErrors.accountKeyPath = fieldErrors.accountKeyPath[0] ?? null;
      }
      setFormErrors(nextErrors);
      setIsLoading(false);
      return;
    }

    setDerivationScheme(parsed.data.derivationScheme);
    setAccountKeyPath(parsed.data.accountKeyPath);

    try {
      const csrfToken = await getCsrfToken();
      const requestBody = {
        config: parsed.data.accountKeyPath
          ? {
              derivationScheme: parsed.data.derivationScheme,
              accountKeyPath: parsed.data.accountKeyPath,
            }
          : {
              derivationScheme: parsed.data.derivationScheme,
            },
      };
      const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken } as const;
      const previewEndpoints = [
        `/api/stores/${storeId}/payment-methods/onchain/btc/preview`,
        `/api/stores/${storeId}/wallets/btc/preview`,
      ];
      let payload: unknown;
      let lastError: unknown = null;

      for (const endpoint of previewEndpoints) {
        try {
          payload = await apiPost<unknown>(endpoint, requestBody, { headers });
          lastError = null;
          break;
        } catch (error: unknown) {
          lastError = error;
          if (isApiError(error) && error.status === 404 && endpoint !== previewEndpoints[previewEndpoints.length - 1]) {
            continue;
          }
          throw error;
        }
      }

      if (payload === undefined) {
        if (lastError instanceof Error) {
          throw lastError;
        }
        if (lastError) {
          throw new Error("Preview request failed.");
        }
        throw new Error("No preview payload returned by the server.");
      }
      const normalized = normalizePreviewResponsePayload(payload);
      if (!normalized) {
        throw new Error("Invalid preview payload returned by the server.");
      }
      setPreview(normalized);
      setStep("confirm");
    } catch (error: unknown) {
      if (isApiError(error)) {
        if (error.status === 422 || error.status === 400) {
          const message = normalizePreviewErrorMessage(error);
          setFormErrors({
            derivationScheme: message,
            accountKeyPath: undefined,
          });
          setFormError(null);
          return;
        }
        if (error.status === 403) {
          const message = "You do not have permission to modify this store.";
          setFormError(message);
          toastContext.toast({ title: "Insufficient permissions", description: message, variant: "destructive" });
          return;
        }

        const message = normalizePreviewErrorMessage(error);
        setFormError(message);
        toastContext.toast({ title: "Preview failed", description: message, variant: "destructive" });
        return;
      }

      const message = error instanceof Error ? error.message : "Unexpected error during preview.";
      setFormError(message);
      toastContext.toast({ title: "Unexpected error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [accountKeyPath, derivationScheme, isLoading, storeId, toastContext]);

  const handleConfirm = useCallback(async () => {
    if (!preview || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const csrfToken = await getCsrfToken();
      const payload = {
        derivationScheme,
        accountKeyPath: accountKeyPath ?? undefined,
        enabled: true,
      };
      await api<unknown>(`/api/stores/${storeId}/wallets/btc`, {
        method: "PUT",
        body: payload,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      });
      toastContext.toast({
        title: "Wallet connected",
        description: "The on-chain Bitcoin wallet has been saved for this store.",
        variant: "success",
      });
      router.replace(`/stores/${storeId}/wallets/btc/transactions?connected=1`);
      router.refresh();
    } catch (error: unknown) {
      if (isApiError(error)) {
        let message = error.message || "Failed to save wallet configuration.";
        if (error.status === 401) {
          message = "BTCPay authentication failed";
        } else if (error.status === 502) {
          message = "BTCPay upstream error, try again";
        }
        toastContext.toast({ title: "Save failed", description: message, variant: "destructive" });
        return;
      }

      const message = error instanceof Error ? error.message : "Unexpected error while saving wallet.";
      toastContext.toast({ title: "Unexpected error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [accountKeyPath, derivationScheme, isLoading, preview, router, storeId, toastContext]);

  const handleBackToEnter = useCallback(() => {
    setStep("enter");
  }, []);

  const addressList = useMemo(() => {
    if (!addresses.length) {
      return null;
    }

    return (
      <ol className="space-y-2">
        {addresses.map((item, index) => {
          const metadata: string[] = [];
          if (item.keyPath) {
            metadata.push(`Key path: ${item.keyPath}`);
          }
          if (typeof item.index === "number") {
            metadata.push(`Index: ${item.index}`);
          }

          return (
            <li
              key={`${item.address}-${item.keyPath ?? item.index ?? index}`}
              className="rounded-md border border-muted bg-muted/40 px-4 py-3 text-sm"
            >
              <div className="font-medium text-foreground">{item.address}</div>
              {metadata.length > 0 && (
                <div className="text-xs text-muted-foreground">{metadata.join(" • ")}</div>
              )}
            </li>
          );
        })}
      </ol>
    );
  }, [addresses]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Connect a Bitcoin wallet</h1>
        <p className="text-sm text-muted-foreground">
          Import the extended public key (xpub/ypub/zpub or NBX expression) from your external wallet and
          confirm the first receiving addresses. BTCPay recommends verifying these addresses in your own
          wallet before accepting payments.
        </p>
      </header>

      {step === "connect" && (
        <section className="grid gap-4 md:grid-cols-1">
          <Card className="border border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Connect an existing wallet</CardTitle>
              <CardDescription>
                Import the read-only extended public key (xpub/ypub/zpub or NBX expression) from your hardware or
                software wallet. This wizard only stores public information needed to derive receiving addresses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleStart}>Enter extended public key</Button>
            </CardContent>
          </Card>
        </section>
      )}

      {step === "enter" && (
        <Card className="border border-muted">
          <CardHeader>
            <CardTitle className="text-lg">Enter your derivation information</CardTitle>
            <CardDescription>
              Paste the extended public key (xpub/ypub/zpub for mainnet or tpub/upub/vpub for testnet) or a
              descriptor expression such as <code>wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub…/0/*)[#checksum]</code>. Checksums are
              optional but commonly exported by wallets (see the Bitcoin Core descriptor checksum reference). Multisig
              descriptors like
              <code>wsh(sortedmulti(2,[FPR/.../2]xpub…/0/*,[FPR/.../2]xpub…/0/*))</code> are also supported. Account key
              path is optional at this stage and is only required later for PSBT signing. Never paste seeds or
              private keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={(event) => {
                void handlePreview(event);
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="derivationScheme">
                  Derivation scheme (extended key or descriptor)
                </label>
                <Input
                  id="derivationScheme"
                  name="derivationScheme"
                  value={derivationScheme}
                  onChange={handleDerivationChange}
                  placeholder="xpub... | tpub... | wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub.../0/*)[#checksum]"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                {formErrors.derivationScheme && (
                  <p className="text-sm text-destructive">{formErrors.derivationScheme}</p>
                )}
                {networkWarning && !formErrors.derivationScheme && (
                  <p className="text-sm text-amber-600">{networkWarning}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="accountKeyPath">
                  Account key path (optional)
                </label>
                <Input
                  id="accountKeyPath"
                  name="accountKeyPath"
                  value={accountKeyPath ?? ""}
                  onChange={handleAccountKeyPathChange}
                  placeholder="m/84&apos;/1&apos;/0&apos;"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Needed only for PSBT signing in Wallet settings. Use the path from your wallet, for
                  example <code>m/84&apos;/0&apos;/0&apos;</code> on mainnet or <code>m/84&apos;/1&apos;/0&apos;</code> on testnet.
                </p>
                {showTestnetAccountHint && !formErrors.accountKeyPath && (
                  <p className="text-xs text-sky-600">
                    For testnet BIP84 you usually want m/84&apos;/1&apos;/0&apos;. Alternatively, paste a descriptor like
                    wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub.../0/*).
                  </p>
                )}
                {formErrors.accountKeyPath && (
                  <p className="text-sm text-destructive">{formErrors.accountKeyPath}</p>
                )}
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex items-center justify-between gap-4">
                <Button type="button" variant="secondary" onClick={() => setStep("connect")}>
                  Back
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Checking…" : "Preview addresses"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && preview && (
        <Card className="border border-muted">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Confirm receiving addresses</CardTitle>
            <CardDescription>
              Compare the first deposit addresses with your external wallet and verify them in your wallet of
              choice (Electrum, Wasabi, Ledger, Sparrow, Specter). Only confirm once the addresses match exactly.
            </CardDescription>
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
              Derivation scheme: <span className="font-mono text-foreground">{derivationScheme}</span>
              {accountKeyPath && (
                <>
                  <br />Account key path: <span className="font-mono text-foreground">{accountKeyPath}</span>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">Deposit addresses returned by BTCPay</h2>
              {addressList ?? (
                <p className="text-sm text-muted-foreground">No addresses were returned by BTCPay.</p>
              )}
              {showTestnetAddressHint && (
                <p className="text-xs text-sky-700">
                  On Bitcoin testnet, receiving addresses commonly start with <span className="font-mono text-foreground">tb1…</span>.
                  If your wallet displays another prefix, double-check the selected network before proceeding.
                </p>
              )}
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                BTCPay derives these addresses using NBXplorer. Confirm that your wallet shows the same key paths
                and receiving addresses before enabling this payment method. If the addresses differ, double-check
                the derivation scheme and account key path in your wallet configuration.
              </p>
              <p className="font-medium text-foreground">
                Tip: use your wallet&apos;s address explorer to confirm each path and mark them as verified before
                proceeding.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <Button variant="secondary" onClick={handleBackToEnter}>
                Back
              </Button>
              <Button
                onClick={() => {
                  void handleConfirm();
                }}
                disabled={isLoading || !preview}
              >
                {isLoading ? "Saving…" : "Confirm and save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
