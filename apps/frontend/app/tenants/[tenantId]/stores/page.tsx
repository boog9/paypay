import type { ReactElement } from "react";
import Link from "next/link";
import { bffFetch } from "../../../../lib/bff-fetch";
import { Button } from "../../../../components/ui/button";
import { StoreCard } from "./store-card";

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
  const response = await bffFetch(`/api/tenants/${tenantId}/stores`);
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

type StoresPageProps = {
  params: Promise<StoresPageParams>;
};

async function StoresPage({ params }: StoresPageProps): Promise<ReactElement> {
  const { tenantId } = await params;
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
          {stores.map((store) => (
            <StoreCard key={store.storeId} tenantId={tenantId} store={store} />
          ))}
        </section>
      )}
    </div>
  );
}

export default StoresPage as unknown as (props: StoresPageProps) => Promise<ReactElement>;
