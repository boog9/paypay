import type { ReactElement } from "react";
import Link from "next/link";
import { fetchFromBff } from "../../../../lib/server-api";
import { Button } from "../../../../components/ui/button";

interface TenantStoreSummary {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  btcpayHost: string;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchStores(tenantId: string): Promise<TenantStoreSummary[]> {
  const response = await fetchFromBff(`/tenants/${tenantId}/stores`);
  if (!response.ok) {
    throw new Error(`Failed to load stores (${response.status}).`);
  }
  const payload = (await response.json()) as TenantStoreSummary[];
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload;
}

type StoresPageParams = {
  tenantId: string;
};

async function StoresPage({ params }: { params: StoresPageParams }): Promise<ReactElement> {
  const { tenantId } = params;
  const stores = await fetchStores(tenantId);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">Stores</h1>
            <p className="text-sm text-muted-foreground">
              Manage BTCPay stores linked to your organization. Each store is provisioned with a scoped Greenfield API key and
              webhook registered by the backend.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button asChild>
              <Link href={`/tenants/${tenantId}/stores/create`}>Create store</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="https://docs.btcpayserver.org/CreateStore/" target="_blank" rel="noopener noreferrer">
                Open BTCPay guide
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {stores.length === 0 ? (
        <section className="rounded-xl border border-dashed bg-muted/30 p-12 text-center shadow-sm">
          <h2 className="text-xl font-semibold">No stores yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first store to generate invoices, configure payment requests and connect wallets through the BTCPay
            Greenfield API.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/tenants/${tenantId}/stores/create`}>Create BTCPay store</Link>
          </Button>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {stores.map((store) => {
            const displayName = store.storeName?.trim().length ? store.storeName : "Unnamed store";
            const maskedKey = store.storeKeyLastFour ? `****${store.storeKeyLastFour}` : "Unavailable";
            return (
              <article key={store.storeId} className="rounded-xl border bg-card p-6 shadow-sm">
                <header className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
                  <p className="text-sm text-muted-foreground">
                    Store ID <span className="font-mono text-foreground">{store.btcpayStoreId}</span>
                  </p>
                </header>
                <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium text-foreground">BTCPay host</dt>
                    <dd className="text-right">
                      <a
                        href={store.btcpayHost}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {store.btcpayHost}
                      </a>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium text-foreground">API key</dt>
                    <dd className="text-right font-mono text-foreground">{maskedKey}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium text-foreground">Wallet setup</dt>
                    <dd className="text-right text-foreground">{formatWalletStatus(store.walletSetupStatus)}</dd>
                  </div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href={`/tenants/${tenantId}/stores/${store.storeId}/dashboard`}>Open store</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/tenants/${tenantId}/stores/${store.storeId}/settings`}>View settings</Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default StoresPage as unknown as (props: { params: StoresPageParams }) => Promise<ReactElement>;

function formatWalletStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "ready":
      return "Ready";
    case "pending":
      return "Pending setup";
    case "disabled":
      return "Disabled";
    default:
      return status;
  }
}
