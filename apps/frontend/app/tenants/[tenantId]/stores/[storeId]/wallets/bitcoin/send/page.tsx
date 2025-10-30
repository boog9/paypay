import type { ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageParams {
  tenantId: string;
  storeId: string;
}

export default async function SendPage({
  params
}: {
  params: Promise<PageParams>;
}): Promise<ReactElement> {
  await params;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Initiate on-chain payouts directly from your BTCPay wallet. This section will soon allow you to draft PSBTs,
          select inputs and broadcast transactions without leaving the portal.
        </p>
        <p>For now, please continue using the BTCPay wallet UI to send funds.</p>
      </CardContent>
    </Card>
  );
}
