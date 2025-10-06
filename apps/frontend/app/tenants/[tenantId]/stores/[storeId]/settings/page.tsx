import type { ReactElement } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import StoreSettingsClient from "./store-settings-client";
import { getBffApiBaseUrl } from "../../../../../../lib/bff";

interface StoreSettingsResponse {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  apiKeyManagedByTenant: boolean;
}

async function fetchStoreSettings(tenantId: string, storeId: string): Promise<StoreSettingsResponse> {
  const baseUrl = getBffApiBaseUrl();
  const url = `${baseUrl}/tenants/${tenantId}/stores/${storeId}`;
  const cookieStore = cookies() as unknown as Awaited<ReturnType<typeof cookies>>;
  const serializedCookies = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(serializedCookies ? { Cookie: serializedCookies } : {})
    }
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(`Failed to load store settings (${response.status}).`);
  }

  return (await response.json()) as StoreSettingsResponse;
}

type StoreSettingsPageParams = {
  tenantId: string;
  storeId: string;
};

async function StoreSettingsPage({
  params
}: {
  params: StoreSettingsPageParams;
}) {
  const { tenantId, storeId } = params;
  const initialData = await fetchStoreSettings(tenantId, storeId);

  return <StoreSettingsClient tenantId={tenantId} storeId={storeId} initialData={initialData} />;
}

export default StoreSettingsPage as unknown as (props: any) => Promise<ReactElement>;
