import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFromBff } from "../../../../../lib/server-api";
import { Button } from "../../../../../components/ui/button";
import { StoreLayoutProvider } from "./store-layout-context";
import { StoreSidebar, StoreSidebarSection } from "./store-sidebar";

interface StoreSettingsResponse {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  btcpayHost: string;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
}

async function loadStoreSettings(tenantId: string, storeId: string): Promise<StoreSettingsResponse> {
  const response = await fetchFromBff(`/tenants/${tenantId}/stores/${storeId}`);
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`Failed to load store settings (${response.status}).`);
  }
  return (await response.json()) as StoreSettingsResponse;
}

function buildStoreSections(tenantId: string, storeId: string): StoreSidebarSection[] {
  const base = `/tenants/${tenantId}/stores/${storeId}`;
  return [
    {
      title: "Store",
      items: [
        { label: "Dashboard", href: `${base}/dashboard` },
        { label: "Settings", href: `${base}/settings` }
      ]
    },
    {
      title: "Payments",
      items: [
        { label: "Invoices", href: `${base}/payments/invoices` },
        { label: "Payment Requests", href: `${base}/payments/requests` },
        { label: "Pull Payments", href: `${base}/payments/pull-payments` },
        { label: "Reporting", href: `${base}/payments/reporting` }
      ]
    },
    {
      title: "Checkout & Integrations",
      items: [{ label: "API Keys", href: `${base}/checkout-integrations/api-keys` }]
    },
    {
      title: "Wallets",
      items: [{ label: "Bitcoin (On-Chain)", href: `${base}/wallets/bitcoin` }]
    }
  ];
}

function buildStoreLink(host: string, storeId: string): string | null {
  try {
    const url = new URL(host);
    url.pathname = `/stores/${storeId}`;
    return url.toString();
  } catch {
    return null;
  }
}

type StoreLayoutParams = {
  tenantId: string;
  storeId: string;
};

type StoreLayoutProps = {
  children: ReactNode;
  params: Promise<StoreLayoutParams>;
};

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { tenantId, storeId } = await params;
  const store = await loadStoreSettings(tenantId, storeId);
  const sections = buildStoreSections(tenantId, storeId);
  const btcpayStoreUrl = buildStoreLink(store.btcpayHost, store.btcpayStoreId);
  const providerValue = {
    tenantId,
    storeId,
    btcpayStoreId: store.btcpayStoreId,
    btcpayHost: store.btcpayHost,
    storeName: store.storeName,
    storeWebsite: store.storeWebsite,
    storeKeyLastFour: store.storeKeyLastFour,
    walletSetupStatus: store.walletSetupStatus,
    apiKeyManagedByTenant: store.apiKeyManagedByTenant
  } as const;

  return (
    <StoreLayoutProvider value={providerValue}>
      <div className="flex flex-col gap-8">
        <header className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <nav className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link href={`/tenants/${tenantId}/stores`} className="hover:text-foreground">
                  Stores
                </Link>
                <span>/</span>
                <span className="text-foreground">{store.storeName ?? store.btcpayStoreId}</span>
              </nav>
              <h1 className="text-3xl font-semibold text-foreground">{store.storeName ?? "Unnamed store"}</h1>
              <p className="text-sm text-muted-foreground">
                Connected to BTCPay store <span className="font-mono text-foreground">{store.btcpayStoreId}</span> on
                {" "}
                <a
                  href={store.btcpayHost}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {store.btcpayHost}
                </a>
                .
              </p>
            </div>
            <div className="flex gap-3">
              {btcpayStoreUrl && (
                <Button asChild variant="outline">
                  <Link href={btcpayStoreUrl} target="_blank" rel="noopener noreferrer">
                    Open in BTCPay
                  </Link>
                </Button>
              )}
              <Button asChild>
                <Link href={`/tenants/${tenantId}/stores/${storeId}/payments/invoices`}>Create invoice</Link>
              </Button>
            </div>
          </div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border bg-card/60 p-4 shadow-sm">
            <StoreSidebar sections={sections} />
          </aside>
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </StoreLayoutProvider>
  );
}
