import type { ReactElement } from "react";
import StoreSettingsContainer from "./store-settings-container";

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
  return <StoreSettingsContainer tenantId={tenantId} storeId={storeId} />;
}

export default StoreSettingsPage as unknown as (props: any) => Promise<ReactElement>;
