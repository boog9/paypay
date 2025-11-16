"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { bffFetch } from "@/lib/bff-fetch";
import { storeSettingsPath } from "@/lib/storePaths";

const DEFAULT_ERROR_MESSAGE = "Failed to save store settings.";
const DELETE_ERROR_MESSAGE = "Failed to delete store.";

type StoreSettings = {
  storeId: string;
  name: string;
  website: string | null;
  defaultCurrency: string;
};

type StoreSettingsFormProps = {
  initial: StoreSettings;
};

function parseStoreSettingsPayload(value: unknown): StoreSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const storeId = typeof record.storeId === "string" ? record.storeId : null;
  const name = typeof record.name === "string" ? record.name : null;
  const defaultCurrency = typeof record.defaultCurrency === "string" ? record.defaultCurrency : null;
  const website =
    record.website === null || record.website === undefined
      ? null
      : typeof record.website === "string"
        ? record.website
        : null;

  if (!storeId || !name || !defaultCurrency) {
    return null;
  }

  return {
    storeId,
    name,
    website,
    defaultCurrency,
  } satisfies StoreSettings;
}

function normalizeNonEmpty(value: string): string {
  return value.trim();
}

export function StoreSettingsForm({ initial }: StoreSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [website, setWebsite] = useState(initial.website ?? "");
  const [defaultCurrency, setDefaultCurrency] = useState(initial.defaultCurrency);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete" | null>(null);

  useEffect(() => {
    setName(initial.name);
    setWebsite(initial.website ?? "");
    setDefaultCurrency(initial.defaultCurrency);
  }, [initial.defaultCurrency, initial.name, initial.storeId, initial.website]);

  const currencyOptions = useMemo(() => {
    const codes = new Set<string>();
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      try {
        const supported = Intl.supportedValuesOf("currency");
        supported
          .filter((code): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code))
          .forEach((code) => codes.add(code));
      } catch {
        // Fallback to curated list below
      }
    }
    [
      "BTC",
      "XBT",
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
    ].forEach((code) => codes.add(code));

    const normalizedDefault = initial.defaultCurrency?.toUpperCase();
    if (normalizedDefault) {
      codes.add(normalizedDefault);
    }

    return Array.from(codes).sort();
  }, [initial.defaultCurrency]);

  const storeId = initial.storeId;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSaving || isDeleting) {
        return;
      }

      const trimmedName = normalizeNonEmpty(name);
      if (!trimmedName) {
        setFormError("Store name is required.");
        return;
      }

      const normalizedCurrency = normalizeNonEmpty(defaultCurrency).toUpperCase();
      if (!normalizedCurrency) {
        setFormError("Default currency is required.");
        return;
      }

      const trimmedWebsite = normalizeNonEmpty(website);
      const payload = {
        name: trimmedName,
        website: trimmedWebsite ? trimmedWebsite : null,
        defaultCurrency: normalizedCurrency,
      } satisfies Partial<StoreSettings>;

      setIsSaving(true);
      setFormError(null);

      try {
        const response = await bffFetch(storeSettingsPath(storeId), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 401) {
          router.replace("/sign-in?reason=session-expired");
          return;
        }

        if (response.status === 404) {
          router.replace("/stores");
          return;
        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
              ? (data as { message: string }).message
              : DEFAULT_ERROR_MESSAGE;
          setFormError(message);
          toast({ title: "Failed to save store settings", description: message, variant: "destructive" });
          return;
        }

        const parsed = parseStoreSettingsPayload(data);
        if (!parsed) {
          throw new Error("Unexpected store settings payload.");
        }

        setName(parsed.name);
        setWebsite(parsed.website ?? "");
        setDefaultCurrency(parsed.defaultCurrency);
        toast({ title: "Settings saved", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
        setFormError(message);
        toast({ title: "Failed to save store settings", description: message, variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    },
    [defaultCurrency, isDeleting, isSaving, name, router, storeId, toast, website],
  );

  const handleDelete = useCallback(
    async (mode: "archive" | "delete") => {
      if (isDeleting || isSaving) {
        return;
      }

      const promptMessage =
        mode === "archive"
          ? "Archiving will disable access to this store in the portal. Are you sure you want to proceed?"
          : "Deleting this store will remove it from BTCPay and revoke access for all users. This action cannot be undone. Continue?";

      const confirmed = typeof window !== "undefined" ? window.confirm(promptMessage) : false;
      if (!confirmed) {
        return;
      }

      setIsDeleting(true);
      setPendingAction(mode);
      setFormError(null);

      try {
        const response = await bffFetch(storeSettingsPath(storeId), {
          method: "DELETE",
        });

        if (response.status === 401) {
          router.replace("/sign-in?reason=session-expired");
          return;
        }

        if (response.status === 404) {
          router.replace("/stores");
          return;
        }

        if (!response.ok && response.status !== 204) {
          const data = await response.json().catch(() => null);
          const message =
            data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
              ? (data as { message: string }).message
              : DELETE_ERROR_MESSAGE;
          setFormError(message);
          toast({ title: "Failed to delete store", description: message, variant: "destructive" });
          return;
        }

        toast({
          title: mode === "archive" ? "Store archived" : "Store deleted",
          variant: "success",
        });
        router.push("/stores");
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : DELETE_ERROR_MESSAGE;
        setFormError(message);
        toast({ title: "Failed to delete store", description: message, variant: "destructive" });
      } finally {
        setIsDeleting(false);
        setPendingAction(null);
      }
    },
    [isDeleting, isSaving, router, storeId, toast],
  );

  return (
    <div className="space-y-8">
      <Card className="border-border/70">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Store details</CardTitle>
          <CardDescription>Update the basic information exposed for this BTCPay store.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="store-id" className="text-sm font-medium text-foreground">
                  Store ID
                </label>
                <Input id="store-id" value={storeId} readOnly />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="store-name" className="text-sm font-medium text-foreground">
                  Store name
                </label>
                <Input
                  id="store-name"
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={1}
                  maxLength={200}
                  autoComplete="organization"
                  disabled={isSaving || isDeleting}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="store-website" className="text-sm font-medium text-foreground">
                Store website
              </label>
              <Input
                id="store-website"
                name="website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                maxLength={2000}
                placeholder="https://example.com"
                disabled={isSaving || isDeleting}
              />
              <p className="text-xs text-muted-foreground">Leave blank to remove the website URL.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">Payment</h2>
                <p className="text-sm text-muted-foreground">Default invoice currency for new checkout sessions.</p>
              </div>
              <div className="flex flex-col gap-2 md:max-w-xs">
                <label htmlFor="default-currency" className="text-sm font-medium text-foreground">
                  Default currency
                </label>
                <Select
                  id="default-currency"
                  name="defaultCurrency"
                  required
                  value={defaultCurrency}
                  onChange={(event) => setDefaultCurrency(event.target.value)}
                  disabled={isSaving || isDeleting}
                >
                  {currencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {formError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
            <Button type="submit" disabled={isSaving || isDeleting} className="self-start">
              {isSaving ? "Saving…" : "Save settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg">Additional actions</CardTitle>
          <CardDescription>Archive or permanently delete this store from BTCPay.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            type="button"
            variant="secondary"
            disabled={isDeleting || isSaving}
            onClick={() => {
              void handleDelete("archive");
            }}
          >
            {pendingAction === "archive" ? "Archiving…" : "Archive this store"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting || isSaving}
            onClick={() => {
              void handleDelete("delete");
            }}
          >
            {pendingAction === "delete" ? "Deleting…" : "Delete this store"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
