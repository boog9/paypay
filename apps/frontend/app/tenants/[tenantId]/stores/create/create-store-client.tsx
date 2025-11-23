"use client";

import { ChangeEvent, FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/button";
import { api, isApiError } from "../../../../../lib/api";

const REQUIRED_PERMISSIONS = [
  "btcpay.store.cancreateinvoice",
  "btcpay.store.canviewinvoices",
  "btcpay.store.canmodifyinvoices",
  "btcpay.store.canmodifypaymentmethods",
  "btcpay.store.canviewstoresettings",
  "btcpay.store.webhooks.canmodifywebhooks"
];

interface CreateStoreClientProps {
  tenantId: string;
}

interface CreateStoreResponse {
  storeId: string;
  btcpayStoreId: string;
}

export default function CreateStoreClient({ tenantId }: CreateStoreClientProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    storeName: "",
    defaultCurrency: "USD",
    preferredExchange: "coingecko",
    storeWebsite: ""
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const updateField = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    startSubmit(async () => {
      try {
        const payload = {
          storeName: form.storeName.trim(),
          defaultCurrency: form.defaultCurrency.trim().toUpperCase(),
          preferredExchange: normalizeOptional(form.preferredExchange),
          storeWebsite: normalizeOptional(form.storeWebsite)
        };

        const idempotencyKey = generateIdempotencyKey();

        const response = await api<CreateStoreResponse>(`/api/tenants/${tenantId}/stores`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify(payload)
        });

        if (!response?.storeId) {
          throw new Error("Store creation response did not include an identifier.");
        }

        setStatus("Store created successfully. Redirecting to settings…");
        router.push(`/tenants/${tenantId}/stores/${response.storeId}/settings`);
      } catch (submissionError) {
        setError(resolveSubmissionError(submissionError));
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold">Create BTCPay Store</h1>
          <p className="text-sm text-muted-foreground">
            The backend will create a temporary BTCPay API key to bootstrap the store, issue a new scoped credential that
            remains managed by PayPay, and register the default webhook on your behalf. Confirm the store details below and
            submit to finish provisioning.
          </p>
        </header>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {status && !error && (
          <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">{status}</div>
        )}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="storeName" className="text-sm font-medium text-foreground">
                Store name
              </label>
              <input
                id="storeName"
                name="storeName"
                required
                value={form.storeName}
                onChange={updateField("storeName")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="BTCPayServerDemo"
                autoComplete="organization"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="defaultCurrency" className="text-sm font-medium text-foreground">
                Default currency
              </label>
              <input
                id="defaultCurrency"
                name="defaultCurrency"
                required
                value={form.defaultCurrency}
                onChange={updateField("defaultCurrency")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="USD"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="preferredExchange" className="text-sm font-medium text-foreground">
                Rate provider (optional)
              </label>
              <input
                id="preferredExchange"
                name="preferredExchange"
                value={form.preferredExchange}
                onChange={updateField("preferredExchange")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="coingecko"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Use provider identifiers from the BTCPay "Rates" settings, for example <code>coingecko</code> or <code>bitfinex</code>.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label htmlFor="storeWebsite" className="text-sm font-medium text-foreground">
                Store website (optional)
              </label>
              <input
                id="storeWebsite"
                name="storeWebsite"
                value={form.storeWebsite}
                onChange={updateField("storeWebsite")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="https://merchant.example.com"
                type="url"
                autoComplete="url"
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
              {isSubmitting ? "Creating…" : "Create store"}
            </Button>
          </div>
        </form>
      </section>
      <section className="rounded-xl border bg-muted/30 p-6 text-sm shadow-sm">
        <h2 className="text-lg font-semibold">Required BTCPay permissions</h2>
        <p className="mt-2 text-muted-foreground">
          Managed API keys created for each store include the following scoped permissions to support invoicing and webhook
          management while keeping configuration changes gated behind temporary credentials:
        </p>
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {REQUIRED_PERMISSIONS.map((permission) => (
            <li key={permission} className="rounded-md border bg-background px-3 py-2 font-mono text-xs">
              {permission}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-muted-foreground">
          See the BTCPay Server guide for additional context:
          <a
            className="ml-1 text-primary underline-offset-4 hover:underline"
            href="https://docs.btcpayserver.org/CreateStore/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create Store documentation
          </a>
          .
        </p>
      </section>
    </div>
  );
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `store-${fallback}`;
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSubmissionError(error: unknown): string {
  const fallback = "Failed to create BTCPay store.";

  if (isApiError(error)) {
    const body = error.body as any;
    const message = typeof body?.message === "string" ? body.message.trim() : null;
    if (message) {
      return message;
    }
    if (Array.isArray(body)) {
      const items = body.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item.length > 0);
      if (items.length > 0) {
        return items.join("\n");
      }
    }
    return `${fallback} (status ${error.status}).`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
