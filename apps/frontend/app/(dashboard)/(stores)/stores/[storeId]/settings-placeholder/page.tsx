import Link from "next/link";

export const metadata = {
  title: "Store settings placeholder",
};

type PageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function StoreSettingsPlaceholderPage({ params }: PageProps) {
  const { storeId } = await params;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";

  const walletHref = normalizedStoreId
    ? `/stores/${normalizedStoreId}/wallets/btc`
    : "/stores";

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Store settings</h1>
        <p className="text-sm text-muted-foreground">
          Store-wide settings will be available soon. Use the navigation sidebar to manage wallets and invoices while we finish
          porting the remaining BTCPay configuration screens.
        </p>
      </header>
      <div className="rounded-md border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
        Looking for wallet configuration? Head to the{" "}
        <Link className="font-medium text-foreground underline" href={walletHref}>
          Bitcoin wallet settings
        </Link>{" "}
        page to manage your derivation scheme and receiving addresses.
      </div>
    </div>
  );
}
