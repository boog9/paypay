import type { ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageParams {
  tenantId: string;
  storeId: string;
}

export default async function ReceivePage({
  params
}: {
  params: Promise<PageParams>;
}): Promise<ReactElement> {
  await params;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Generate deposit addresses, monitor gap limits and share payment information with customers from within the
          portal. The full BTCPay receive workflow will land here soon.
        </p>
        <p>Until then, please use the BTCPay wallet interface to access new receiving addresses.</p>
      </CardContent>
    </Card>
  );
}
