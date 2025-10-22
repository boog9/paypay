"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Button } from "../../../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../../../components/ui/card";
import { Input } from "../../../../../../../components/ui/input";
import { api, isApiError } from "../../../../../../../lib/api";
import { useToast } from "../../../../../../../components/ui/toast";
import { getCsrfToken } from "../../../../../../../lib/auth";

type WizardStep = "connect" | "enter" | "confirm";

type PreviewAddress = {
  address: string;
  keyPath: string | null;
  index: number | null;
};

type PreviewResponse = {
  storeId: string;
  currency: string;
  cryptoCode: string;
  paymentMethodId: string;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  addresses: PreviewAddress[];
};

type SaveResponse = {
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
  paymentMethodId: string;
  currency: string;
  cryptoCode: string;
};

const INVALID_DERIVATION_MESSAGE =
  "Invalid derivation scheme. Examples: xpub..., ypub..., wpkh([FPR/...']xpub.../0/*). Set AccountKeyPath like m/84'/0'/0'.";
const DERIVATION_PATTERN = /^[A-Za-z0-9\[\]\(\)'\/\*_,\-]+$/;
const SENSITIVE_PATTERN = /(seed|mnemonic|xprv|yprv|zprv|privatekey)/i;

const formSchema = z.object({
  derivationScheme: z
    .string({ required_error: INVALID_DERIVATION_MESSAGE })
    .trim()
    .min(1, INVALID_DERIVATION_MESSAGE)
    .max(512, INVALID_DERIVATION_MESSAGE)
    .refine((value) => DERIVATION_PATTERN.test(value), {
      message: INVALID_DERIVATION_MESSAGE,
    })
    .refine((value) => !SENSITIVE_PATTERN.test(value), {
      message: INVALID_DERIVATION_MESSAGE,
    }),
  accountKeyPath: z
    .string()
    .optional()
    .transform((value) => (value ? value.trim() : ""))
    .transform((value) => (value.length === 0 ? undefined : value))
    .refine((value) => (value ? /^m(\/\d+'?){2,8}$/i.test(value) : true), {
      message: INVALID_DERIVATION_MESSAGE,
    })
    .refine((value) => (value ? !SENSITIVE_PATTERN.test(value) : true), {
      message: INVALID_DERIVATION_MESSAGE,
    }),
});

type FormErrors = Partial<Record<"derivationScheme" | "accountKeyPath", string>>;

type WizardProps = {
  params: { storeId: string };
};

export default function WalletWizardPage({ params }: WizardProps) {
  const storeId = params.storeId;
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>("connect");
  const [derivationScheme, setDerivationScheme] = useState("");
  const [accountKeyPath, setAccountKeyPath] = useState<string | undefined>(undefined);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const addresses = useMemo(() => preview?.addresses ?? [], [preview]);

  const handleStart = useCallback(() => {
    setStep("enter");
    setFormError(null);
    setFormErrors({});
  }, []);

  const handlePreview = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isLoading) {
        return;
      }

      void (async () => {
        setIsLoading(true);
        setFormError(null);
        setFormErrors({});

        const parsed = formSchema.safeParse({ derivationScheme, accountKeyPath });
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
          const response = await api<PreviewResponse>(`/api/stores/${storeId}/wallets/btc/preview`, {
            method: "POST",
            body: parsed.data,
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          });
          setPreview(response);
          setStep("confirm");
        } catch (error) {
          if (isApiError(error)) {
            const message = error.message || "Failed to preview derivation scheme.";
            setFormError(message);
            toast({ title: "Preview failed", description: message, variant: "destructive" });
          } else {
            const message = error instanceof Error ? error.message : "Unexpected error during preview.";
            setFormError(message);
            toast({ title: "Unexpected error", description: message, variant: "destructive" });
          }
        } finally {
          setIsLoading(false);
        }
      })();
    },
    [accountKeyPath, derivationScheme, isLoading, storeId, toast]
  );

  const handleConfirm = useCallback(() => {
    if (!preview) {
      return;
    }

    if (isLoading) {
      return;
    }

    void (async () => {
      setIsLoading(true);
      try {
        const csrfToken = await getCsrfToken();
        const nextDerivation = preview.derivationScheme ?? derivationScheme;
        const nextAccountPath = preview.accountKeyPath ?? accountKeyPath;
        const payload = {
          derivationScheme: nextDerivation,
          accountKeyPath: nextAccountPath,
          enabled: true,
        };
        await api<SaveResponse>(`/api/stores/${storeId}/wallets/btc`, {
          method: "PUT",
          body: payload,
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        });
        toast({
          title: "Wallet connected",
          description: "The on-chain Bitcoin wallet has been saved for this store.",
          variant: "success",
        });
        router.replace(`/stores/${storeId}/wallets/btc/settings?connected=1`);
      } catch (error) {
        if (isApiError(error)) {
          const message = error.message || "Failed to save wallet configuration.";
          toast({ title: "Save failed", description: message, variant: "destructive" });
        } else {
          const message = error instanceof Error ? error.message : "Unexpected error while saving wallet.";
          toast({ title: "Unexpected error", description: message, variant: "destructive" });
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accountKeyPath, derivationScheme, isLoading, preview, router, storeId, toast]);

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
          const displayIndex = typeof item.index === "number" ? item.index : index;
          const keyPath = item.keyPath ?? `0/${displayIndex}`;
          return (
            <li
              key={`${item.address}-${displayIndex}`}
              className="rounded-md border border-muted bg-muted/40 px-4 py-3 text-sm"
            >
              <div className="font-medium text-foreground">{item.address}</div>
              <div className="text-xs text-muted-foreground">Key path: {keyPath}</div>
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
              Paste the extended public key (xpub/ypub/zpub) or NBX expression from your wallet. Optionally
              include the account key path, such as <code>m/84&apos;/0&apos;/0&apos;</code> for mainnet or
              <code>m/84&apos;/1&apos;/0&apos;</code> for testnet. Never paste seeds or private keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handlePreview}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="derivationScheme">
                  Derivation scheme (xpub/ypub/zpub or NBX)
                </label>
                <Input
                  id="derivationScheme"
                  name="derivationScheme"
                  value={derivationScheme}
                  onChange={(event) => setDerivationScheme(event.target.value)}
                  placeholder="wpkh([FPR/84&apos;/0&apos;/0&apos;]xpub.../0/*)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                {formErrors.derivationScheme && (
                  <p className="text-sm text-destructive">{formErrors.derivationScheme}</p>
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
                  onChange={(event) => setAccountKeyPath(event.target.value || undefined)}
                  placeholder="m/84&apos;/0&apos;/0&apos;"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Use the fingerprint-prefixed form (<code>FPR/84&apos;/0&apos;/0&apos;</code>) if your wallet provides it. The
                  account key path is required for PSBT signing and should match your wallet configuration.
                </p>
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
              Derivation scheme: <span className="font-mono text-foreground">{preview.derivationScheme ?? derivationScheme}</span>
              {preview.accountKeyPath && (
                <>
                  <br />Account key path: <span className="font-mono text-foreground">{preview.accountKeyPath}</span>
                </>
              )}
              {preview.masterFingerprint && (
                <>
                  <br />Master fingerprint: <span className="font-mono text-foreground">{preview.masterFingerprint}</span>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">First 10 deposit addresses (branch 0)</h2>
              {addressList ?? (
                <p className="text-sm text-muted-foreground">No addresses were returned by BTCPay.</p>
              )}
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                BTCPay derives these addresses using NBXplorer. Confirm that your wallet shows the same
                0/0…0/9 addresses before enabling this payment method. If the addresses differ, double-check
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
              <Button onClick={handleConfirm} disabled={isLoading}>
                {isLoading ? "Saving…" : "Confirm and save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
