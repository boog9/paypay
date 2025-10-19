"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import { api, isApiError } from "../../../../lib/api";
import { getCsrfToken } from "../../../../lib/auth";
import { useToast } from "../../../../components/ui/toast";
import { persistLastStoreId } from "../../../../src/lib/store-preferences";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `store-${fallback}`;
}

const formSchema = z.object({
  name: z
    .string({ required_error: "Store name is required" })
    .min(3, "Store name must be at least 3 characters long")
    .max(100, "Store name cannot exceed 100 characters")
    .transform((value) => value.trim()),
  defaultCurrency: z
    .string({ required_error: "Default currency is required" })
    .length(3, "Currency must be a 3-letter ISO code")
    .transform((value) => value.trim().toUpperCase()),
});

type FieldErrors = Partial<Record<"name" | "defaultCurrency", string>>;

type CreateStoreResponse = {
  id: string;
  name: string;
  defaultCurrency: string;
};

export default function CreateStorePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const currencyOptions = useMemo(() => {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      try {
        const supported = Intl.supportedValuesOf("currency");
        return supported
          .filter((code): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code))
          .sort();
      } catch {
        // fall back to a curated subset below
      }
    }
    return [
      "USD",
      "EUR",
      "GBP",
      "JPY",
      "AUD",
      "CAD",
      "CHF",
      "SEK",
      "NOK",
      "DKK",
      "PLN",
      "CZK",
      "HUF",
      "RUB",
      "CNY",
      "HKD",
      "SGD",
      "NZD",
      "BRL",
      "MXN",
    ];
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }

      void (async () => {
        setIsSubmitting(true);
        setFormError(null);
        setFieldErrors({});

        const rawData = { name, defaultCurrency };
        const parsed = formSchema.safeParse(rawData);
        if (!parsed.success) {
          const issues = parsed.error.flatten();
          const nextErrors: FieldErrors = {};
          if (issues.fieldErrors.name?.length) {
            nextErrors.name = issues.fieldErrors.name[0] ?? null;
          }
          if (issues.fieldErrors.defaultCurrency?.length) {
            nextErrors.defaultCurrency = issues.fieldErrors.defaultCurrency[0] ?? null;
          }
          setFieldErrors(nextErrors);
          setIsSubmitting(false);
          return;
        }

        try {
          const csrfToken = await getCsrfToken();
          const payload = parsed.data;
          const response = await api<CreateStoreResponse>("/api/stores", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-CSRF-Token": csrfToken,
              "Idempotency-Key": generateIdempotencyKey(),
            },
            body: JSON.stringify(payload),
          });

          await queryClient.invalidateQueries({ queryKey: ["stores"] });
          persistLastStoreId(response.id);
          toast({ title: "Store successfully created", variant: "success" });
          router.push(`/stores/${response.id}/dashboard`);
        } catch (error) {
          if (isApiError(error)) {
            const message = error.message || "Failed to create store.";
            setFormError(message);
            toast({ title: "Failed to create store", description: message, variant: "destructive" });
          } else {
            const message =
              error instanceof Error ? error.message : "Unexpected error while creating store.";
            setFormError(message);
            toast({ title: "Unexpected error", description: message, variant: "destructive" });
          }
        } finally {
          setIsSubmitting(false);
        }
      })();
    },
    [defaultCurrency, isSubmitting, name, queryClient, router, toast]
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Create your first store</h1>
        <p className="text-sm text-muted-foreground">
          Provision a BTCPay store to start issuing invoices and managing credentials from the PayPay portal.
        </p>
      </header>
      <Card className="border-border/70">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Store details</CardTitle>
          <CardDescription>Provide the basic information required to set up your BTCPay store.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label htmlFor="store-name" className="text-sm font-medium text-foreground">
                Store name
              </label>
              <Input
                id="store-name"
                name="name"
                required
                value={name}
                minLength={3}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Lightning Espresso"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "store-name-error" : undefined}
                autoComplete="organization"
              />
              {fieldErrors.name ? (
                <p id="store-name-error" className="text-sm text-destructive">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="default-currency" className="text-sm font-medium text-foreground">
                Default currency
              </label>
              <Select
                id="default-currency"
                name="defaultCurrency"
                required
                value={defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value)}
                aria-invalid={Boolean(fieldErrors.defaultCurrency)}
                aria-describedby={fieldErrors.defaultCurrency ? "default-currency-error" : undefined}
              >
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              {fieldErrors.defaultCurrency ? (
                <p id="default-currency-error" className="text-sm text-destructive">
                  {fieldErrors.defaultCurrency}
                </p>
              ) : null}
            </div>
            {formError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="self-start">
              {isSubmitting ? "Creating…" : "Create store"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
