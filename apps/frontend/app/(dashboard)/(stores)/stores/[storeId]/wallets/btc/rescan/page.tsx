import type { ReactElement } from "react";

import { RescanClient } from "./rescan-client";

type PageParams = { storeId: string };

type PageProps = { params: Promise<PageParams> };

export default async function RescanPage({ params }: PageProps): Promise<ReactElement> {
  const { storeId } = await params;
  return <RescanClient storeId={storeId} />;
}

