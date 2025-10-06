"use client";

import Link from "next/link";
import { Button } from "../../../../../components/ui/button";
import { useStoreLayout } from "./store-layout-context";

interface StoreFeaturePlaceholderProps {
  title: string;
  description: string;
  documentationUrl: string;
  documentationLabel?: string;
}

export function StoreFeaturePlaceholder({
  title,
  description,
  documentationUrl,
  documentationLabel = "Open documentation"
}: StoreFeaturePlaceholderProps) {
  const store = useStoreLayout();
  const displayName = store.storeName ?? store.btcpayStoreId;

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="mt-6 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
        {displayName} remains fully operational through BTCPay Server while this portal experience is under active development.
        Follow the official guide below to manage the feature directly inside BTCPay.
      </div>
      <Button asChild className="mt-6" variant="outline">
        <Link href={documentationUrl} target="_blank" rel="noopener noreferrer">
          {documentationLabel}
        </Link>
      </Button>
    </section>
  );
}
