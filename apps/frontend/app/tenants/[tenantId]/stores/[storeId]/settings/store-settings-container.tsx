"use client";

import StoreSettingsClient from "./store-settings-client";
import { useStoreLayout } from "../store-layout-context";

interface StoreSettingsContainerProps {
  tenantId: string;
  storeId: string;
}

export default function StoreSettingsContainer({ tenantId, storeId }: StoreSettingsContainerProps) {
  const store = useStoreLayout();

  return (
    <StoreSettingsClient
      tenantId={tenantId}
      storeId={storeId}
      initialData={{
        storeId,
        btcpayStoreId: store.btcpayStoreId,
        storeName: store.storeName,
        storeWebsite: store.storeWebsite,
        storeKeyLastFour: store.storeKeyLastFour,
        apiKeyManagedByTenant: store.apiKeyManagedByTenant,
        btcpayHost: store.btcpayHost,
        walletSetupStatus: store.walletSetupStatus
      }}
    />
  );
}
