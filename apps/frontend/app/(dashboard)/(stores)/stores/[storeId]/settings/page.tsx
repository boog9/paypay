import Link from "next/link";
import { redirect } from "next/navigation";

import { bffFetch } from "@/lib/bff-fetch";
import { storeSettingsPath } from "@/lib/storePaths";

import { StoreSettingsForm } from "./_components/StoreSettingsForm";

export const metadata = {
  title: "Store settings",
};

type PageProps = {
  params: Promise<{ storeId: string }>;
};

type StoreSettings = {
  storeId: string;
  name: string;
  website: string | null;
  defaultCurrency: string;
};

export type StoreSettingsResult =
  | { kind: "ok"; data: StoreSettings }
  | { kind: "rate-limited" };

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

export async function loadStoreSettings(storeId: string): Promise<StoreSettingsResult> {
  let response: Response;
  try {
    response = await bffFetch(storeSettingsPath(storeId), { cache: "no-store" });
  } catch (error) {
    throw new Error(`Failed to load store settings: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (response.status === 404) {
    redirect("/stores");
  }

  if (response.status === 429) {
    return { kind: "rate-limited" };
  }

  if (!response.ok) {
    throw new Error(`Failed to load store settings (status ${response.status}).`);
  }

  const payload = parseStoreSettingsPayload(await response.json());
  if (!payload) {
    throw new Error("Unexpected store settings payload.");
  }
  return { kind: "ok", data: payload };
}

export default async function StoreSettingsPage({ params }: PageProps) {
  const { storeId } = await params;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";

  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const settingsResult = await loadStoreSettings(normalizedStoreId);

  if (settingsResult.kind === "rate-limited") {
    return (
      <div className="space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Store settings</h1>
          <p className="text-sm text-muted-foreground">
            Store-wide settings will be available soon. Use the navigation sidebar to manage wallets and invoices while we
            finish porting the remaining BTCPay configuration screens.
          </p>
        </header>
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-900">
          Too many requests to the BFF (rate limit). Please wait a few seconds and refresh the page.
        </div>
      </div>
    );
  }

  const initialSettings = settingsResult.data;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Store settings</h1>
        <p className="text-sm text-muted-foreground">
          Store-wide settings will be available soon. Use the navigation sidebar to manage wallets and invoices
          while we finish porting the remaining BTCPay configuration screens.
        </p>
      </header>
      <div className="rounded-md border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
        Looking for wallet configuration? Head to the{" "}
        <Link className="font-medium text-foreground underline" href={`/stores/${normalizedStoreId}/wallets/btc`}>
          Bitcoin wallet settings
        </Link>{" "}
        page to manage your derivation scheme and receiving addresses.
      </div>
      <StoreSettingsForm initial={initialSettings} />
    </div>
  );
}
