"use client";

import { ChangeEvent, FormEvent, use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../../../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { Input } from "../../../../../../../../components/ui/input";
import { ApiError, api, isApiError } from "../../../../../../../../lib/api";
import { getCsrfToken } from "../../../../../../../../lib/auth";
import { CSRF_HEADER } from "../../../../../../../../lib/http-headers";
import { useToast } from "../../../../../../../../components/ui/toast";
import { bffFetch } from "../../../../../../../../lib/bff-fetch";
import {
  descriptorPreviewSchema,
  detectNetworkFromInput,
  importWalletSchema,
  resolveInstanceNetwork,
} from "./validation";

type WizardStep = "connect" | "enter" | "confirm";

type PreviewAddress = {
  address: string;
  keyPath: string | null;
  index: number | null;
};

type PreviewResponse = {
  addresses: PreviewAddress[];
};

type WizardMode = "descriptor" | "import";

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
  const addressesRaw = Array.isArray(record.addresses) ? record.addresses : [];
  const addresses = addressesRaw
    .map((item) => normalizePreviewAddressPayload(item))
    .filter((item): item is PreviewAddress => item !== null);

  return { addresses } satisfies PreviewResponse;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function extractRequestIdFromHeaders(headers: Headers): string | null {
  const candidates = ["x-request-id", "x-requestid"] as const;
  for (const header of candidates) {
    const value = headers.get(header);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

async function buildApiErrorFromResponse(response: Response): Promise<ApiError> {
  const body = await parseResponseBody(response);
  let message = "";

  if (typeof body === "string") {
    message = body.trim();
  } else if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const candidates: unknown[] = [record.message, record.error];
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed) {
          message = trimmed;
          break;
        }
      }
    }
  }

  if (!message) {
    const statusText = response.statusText?.trim();
    message = statusText && statusText.length > 0 ? statusText : "Request failed";
  }

  const requestId = extractRequestIdFromHeaders(response.headers);
  return new ApiError(response.status, message, body, response.headers, requestId);
}

async function attemptSessionRefresh(): Promise<boolean> {
  try {
    const response = await bffFetch("/api/auth/refresh", { method: "POST" });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
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

type FormErrors = Partial<
  Record<"derivationScheme" | "descriptorAccountKeyPath" | "tpub" | "rootFingerprint" | "accountKeyPath", string>
>;

type WizardProps = {
  params: Promise<{ storeId: string }>;
};

export default function WalletWizardPage({ params }: WizardProps) {
  const { storeId } = use(params);
  const router = useRouter();
  const toastContext = useToast();

  const [step, setStep] = useState<WizardStep>("connect");
  const [mode, setMode] = useState<WizardMode>("import");
  const [descriptorInput, setDescriptorInput] = useState<{ derivationScheme: string; accountKeyPath: string }>(() => ({
    derivationScheme: "",
    accountKeyPath: "m/84'/1'/0'",
  }));
  const [importInput, setImportInput] = useState<{ tpub: string; rootFingerprint: string; accountKeyPath: string }>(() => ({
    tpub: "",
    rootFingerprint: "",
    accountKeyPath: "84'/1'/0'",
  }));
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isDescriptorMode = mode === "descriptor";
  const isImportMode = mode === "import";
  const addresses = useMemo(() => preview?.addresses ?? [], [preview]);
  const previewSource = mode === "descriptor" ? descriptorInput.derivationScheme : importInput.tpub;
  const derivedNetwork = useMemo(() => detectNetworkFromInput(previewSource), [previewSource]);
  const networkWarning = useMemo(() => {
    if (!INSTANCE_NETWORK || !derivedNetwork) {
      return null;
    }
    if (INSTANCE_NETWORK === derivedNetwork) {
      return null;
    }
    return `This key looks like it belongs to ${derivedNetwork}, but the BTCPay instance is ${INSTANCE_NETWORK}. Preview may fail if they do not match.`;
  }, [derivedNetwork]);

  const handleDescriptorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setDescriptorInput((prev) => ({ ...prev, derivationScheme: value }));
  }, []);

  const handleDescriptorPathChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setDescriptorInput((prev) => ({ ...prev, accountKeyPath: value }));
  }, []);

  const handleTpubChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setImportInput((prev) => ({ ...prev, tpub: value }));
  }, []);

  const handleRootFingerprintChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value.toUpperCase();
    setImportInput((prev) => ({ ...prev, rootFingerprint: value }));
  }, []);

  const handleImportAccountPathChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setImportInput((prev) => ({ ...prev, accountKeyPath: value }));
  }, []);

  const showImportPathHint = useMemo(() => {
    if (mode !== "import") {
      return false;
    }
    return importInput.accountKeyPath.trim().length === 0;
  }, [mode, importInput.accountKeyPath]);

  const showTestnetAddressHint = useMemo(() => {
    if (INSTANCE_NETWORK === "testnet" || derivedNetwork === "testnet") {
      return true;
    }

    return addresses.some((item) => item.address.toLowerCase().startsWith("tb1"));
  }, [addresses, derivedNetwork]);

  const handleSelectMode = useCallback((nextMode: WizardMode) => {
    setMode(nextMode);
    setStep("enter");
    setFormError(null);
    setFormErrors({});
    setPreview(null);
  }, []);

  const handlePreview = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setFormError(null);
    setFormErrors({});

    try {
      let requestBody: Record<string, unknown> = {};
      if (mode === "descriptor") {
        const parsed = descriptorPreviewSchema.safeParse(descriptorInput);
        if (!parsed.success) {
          const nextErrors: FormErrors = {};
          const fieldErrors = parsed.error.flatten().fieldErrors;
          if (fieldErrors.derivationScheme?.length) {
            nextErrors.derivationScheme = fieldErrors.derivationScheme[0] ?? null;
          }
          if (fieldErrors.accountKeyPath?.length) {
            nextErrors.descriptorAccountKeyPath = fieldErrors.accountKeyPath[0] ?? null;
          }
          setFormErrors(nextErrors);
          setIsLoading(false);
          return;
        }
        setDescriptorInput(parsed.data);
        requestBody = {
          derivationScheme: parsed.data.derivationScheme,
          accountKeyPath: parsed.data.accountKeyPath
        };
      } else {
        const parsed = importWalletSchema.safeParse(importInput);
        if (!parsed.success) {
          const nextErrors: FormErrors = {};
          const fieldErrors = parsed.error.flatten().fieldErrors;
          if (fieldErrors.tpub?.length) {
            nextErrors.tpub = fieldErrors.tpub[0] ?? null;
          }
          if (fieldErrors.rootFingerprint?.length) {
            nextErrors.rootFingerprint = fieldErrors.rootFingerprint[0] ?? null;
          }
          if (fieldErrors.accountKeyPath?.length) {
            nextErrors.accountKeyPath = fieldErrors.accountKeyPath[0] ?? null;
          }
          setFormErrors(nextErrors);
          setIsLoading(false);
          return;
        }
        setImportInput(parsed.data);
        requestBody = {
          tpub: parsed.data.tpub,
          rootFingerprint: parsed.data.rootFingerprint,
          accountKeyPath: parsed.data.accountKeyPath
        };
      }

      const csrfToken = await getCsrfToken();

      const requestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json", [CSRF_HEADER]: csrfToken },
        body: JSON.stringify(requestBody),
      } as const;

      let response = await bffFetch(`/api/stores/${storeId}/wallets/onchain/preview`, requestInit);

      if (response.status === 401) {
        const refreshed = await attemptSessionRefresh();
        if (!refreshed) {
          throw await buildApiErrorFromResponse(response);
        }
        response = await bffFetch(`/api/stores/${storeId}/wallets/onchain/preview`, requestInit);
      }

      if (!response.ok) {
        throw await buildApiErrorFromResponse(response);
      }

      const payload = (await response.json()) as unknown;
      const normalized = normalizePreviewResponsePayload(payload);
      if (!normalized) {
        throw new Error("Invalid preview payload returned by the server.");
      }
      setPreview(normalized);
      setStep("confirm");
    } catch (error: unknown) {
      if (isApiError(error)) {
        if (error.status === 400) {
          const message = normalizePreviewErrorMessage(error);
          if (mode === "descriptor") {
            setFormErrors({ derivationScheme: message });
          } else {
            setFormErrors({ tpub: message });
          }
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
  }, [descriptorInput, importInput, isLoading, mode, storeId, toastContext]);

  const handleConfirm = useCallback(async () => {
    if (!preview || isLoading || mode !== "import") {
      return;
    }

    setIsLoading(true);
    try {
      const csrfToken = await getCsrfToken();
      const payload = {
        tpub: importInput.tpub,
        rootFingerprint: importInput.rootFingerprint,
        accountKeyPath: importInput.accountKeyPath,
      };
      await api<unknown>(`/api/stores/${storeId}/wallets/bitcoin`, {
        method: "PUT",
        body: payload,
        headers: { "Content-Type": "application/json", [CSRF_HEADER]: csrfToken },
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
  }, [importInput, isLoading, mode, preview, router, storeId, toastContext]);

  const handleBackToEnter = useCallback(() => {
    setStep("enter");
    setFormError(null);
    setFormErrors({});
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
          Use Import mode to store a testnet extended public key, fingerprint, and account path in BTCPay, or run a
          descriptor-only preview to verify addresses without saving. Only public information is requested—never paste
          seeds or private keys.
        </p>
      </header>

      {step === "connect" && (
        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Import wallet configuration</CardTitle>
              <CardDescription>
                Provide a testnet extended public key (tpub/upub/vpub), master fingerprint, and account key path. This
                mode stores the configuration in BTCPay so invoices use your wallet&apos;s derivation scheme.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => handleSelectMode("import")}>Start import</Button>
            </CardContent>
          </Card>

          <Card className="border border-muted">
            <CardHeader>
              <CardTitle className="text-lg">Preview with descriptor</CardTitle>
              <CardDescription>
                Paste a descriptor (for example <code>wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub…/0/*)</code>) to preview addresses
                without saving configuration. Use this to double-check descriptors exported by other wallets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => handleSelectMode("descriptor")}>
                Preview descriptor
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {step === "enter" && (
        <Card className="border border-muted">
          <CardHeader>
            <CardTitle className="text-lg">
              {isImportMode ? "Import your wallet configuration" : "Preview using a descriptor"}
            </CardTitle>
            <CardDescription>
              {isImportMode ? (
                <>
                  Paste the read-only extended public key exported by your wallet (tpub/upub/vpub on testnet), provide
                  the master fingerprint, and confirm the BIP84/BIP86 account path. This information is stored in BTCPay
                  so invoices derive addresses from your wallet.
                </>
              ) : (
                <>
                  Provide a descriptor such as <code>wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub…/0/*)</code> and the matching account
                  path starting with <code>m/</code>. The preview shows addresses without saving configuration.
                </>
              )}
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              Never paste private keys, recovery phrases, or other secrets. Only share public information exported by your
              wallet.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={(event) => {
                void handlePreview(event);
              }}
            >
              {isDescriptorMode ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="derivationScheme">
                      Descriptor expression
                    </label>
                    <Input
                      id="derivationScheme"
                      name="derivationScheme"
                      value={descriptorInput.derivationScheme}
                      onChange={handleDescriptorChange}
                      placeholder="wpkh([FPR/84&apos;/1&apos;/0&apos;]tpub.../0/*)"
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
                    <label className="text-sm font-medium text-foreground" htmlFor="descriptorAccountKeyPath">
                      Account key path (must start with m/)
                    </label>
                    <Input
                      id="descriptorAccountKeyPath"
                      name="descriptorAccountKeyPath"
                      value={descriptorInput.accountKeyPath}
                      onChange={handleDescriptorPathChange}
                      placeholder="m/84&apos;/1&apos;/0&apos;"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    {formErrors.descriptorAccountKeyPath && (
                      <p className="text-sm text-destructive">{formErrors.descriptorAccountKeyPath}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="tpub">
                      Extended public key (testnet)
                    </label>
                    <Input
                      id="tpub"
                      name="tpub"
                      value={importInput.tpub}
                      onChange={handleTpubChange}
                      placeholder="tpub..."
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    {formErrors.tpub && <p className="text-sm text-destructive">{formErrors.tpub}</p>}
                    {networkWarning && !formErrors.tpub && (
                      <p className="text-sm text-amber-600">{networkWarning}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="rootFingerprint">
                      Root fingerprint
                    </label>
                    <Input
                      id="rootFingerprint"
                      name="rootFingerprint"
                      value={importInput.rootFingerprint}
                      onChange={handleRootFingerprintChange}
                      placeholder="00000000"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    <p className="text-xs text-muted-foreground">8 hexadecimal characters (e.g., F23A9C01).</p>
                    {formErrors.rootFingerprint && (
                      <p className="text-sm text-destructive">{formErrors.rootFingerprint}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="accountKeyPath">
                      Account key path (without m/ prefix)
                    </label>
                    <Input
                      id="accountKeyPath"
                      name="accountKeyPath"
                      value={importInput.accountKeyPath}
                      onChange={handleImportAccountPathChange}
                      placeholder="84&apos;/1&apos;/0&apos;"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the account path reported by your wallet. Testnet BIP84 wallets often use
                      <code className="ml-1">84&apos;/1&apos;/0&apos;</code>.
                    </p>
                    {showImportPathHint && !formErrors.accountKeyPath && (
                      <p className="text-xs text-sky-600">Enter the BIP84 or BIP86 account path without the m/ prefix.</p>
                    )}
                    {formErrors.accountKeyPath && (
                      <p className="text-sm text-destructive">{formErrors.accountKeyPath}</p>
                    )}
                  </div>
                </>
              )}

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex items-center justify-between gap-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep("connect");
                    setFormError(null);
                    setFormErrors({});
                  }}
                >
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
            <CardTitle className="text-lg">
              {isImportMode ? "Confirm receiving addresses" : "Preview receiving addresses"}
            </CardTitle>
            <CardDescription>
              Compare the first deposit addresses with your external wallet. Confirm that each address matches before
              {isImportMode ? " saving this configuration." : " trusting the descriptor."}
            </CardDescription>
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
              {isImportMode ? (
                <>
                  Extended public key: <span className="font-mono text-foreground break-all">{importInput.tpub}</span>
                  <br />Fingerprint: <span className="font-mono text-foreground">{importInput.rootFingerprint}</span>
                  <br />Account key path: <span className="font-mono text-foreground">{importInput.accountKeyPath}</span>
                </>
              ) : (
                <>
                  Descriptor: <span className="font-mono text-foreground break-all">{descriptorInput.derivationScheme}</span>
                  <br />Account key path: <span className="font-mono text-foreground">{descriptorInput.accountKeyPath}</span>
                </>
              )}
            </div>
            {!isImportMode && (
              <p className="text-xs text-muted-foreground">
                Saving is disabled for descriptor previews. Switch to Import mode to store the configuration in BTCPay.
              </p>
            )}
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
              {isImportMode ? (
                <Button
                  onClick={() => {
                    void handleConfirm();
                  }}
                  disabled={isLoading || !preview}
                >
                  {isLoading ? "Saving…" : "Confirm and save"}
                </Button>
              ) : (
                <Button disabled variant="outline" title="Use Import mode to save the wallet configuration.">
                  Saving requires Import mode
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
