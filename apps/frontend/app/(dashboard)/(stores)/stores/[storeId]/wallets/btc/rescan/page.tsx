import type { ReactElement } from "react";

import { RescanClient } from "./rescan-client";

type PageParams = { storeId: string };

export default function RescanPage({ params }: { params: PageParams }): ReactElement {
  const { storeId } = params;
  return <RescanClient storeId={storeId} />;
}

