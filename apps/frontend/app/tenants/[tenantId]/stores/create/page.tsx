import type { ReactElement } from "react";
import CreateStoreClient from "./create-store-client";

type CreateStorePageParams = {
  tenantId: string;
};

async function CreateStorePage({ params }: { params: Promise<CreateStorePageParams> }) {
  const { tenantId } = await params;
  return <CreateStoreClient tenantId={tenantId} />;
}

export default CreateStorePage as unknown as (props: any) => Promise<ReactElement>;
