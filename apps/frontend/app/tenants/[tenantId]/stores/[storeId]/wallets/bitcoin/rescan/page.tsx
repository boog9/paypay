import type { ReactElement } from "react";

import RescanClient from "./rescan-client";

interface PageParams {
  tenantId: string;
  storeId: string;
}

type PageProps = { params: Promise<PageParams> };

export default async function RescanPage({ params }: PageProps): Promise<ReactElement> {
  const { tenantId, storeId } = await params;
  return <RescanClient tenantId={tenantId} storeId={storeId} />;
}
