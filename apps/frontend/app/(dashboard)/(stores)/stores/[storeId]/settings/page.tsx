import Link from "next/link";
import { redirect } from "next/navigation";

import { loadStoreSettings, type StoreSettingsResult } from "./loadStoreSettings";
import { StoreSettingsForm } from "./_components/StoreSettingsForm";

export const metadata = {
  title: "Store settings",
};

type PageProps = {
  params: Promise<{ storeId: string }>;
};

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
