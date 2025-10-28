import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";

export const metadata: Metadata = {
  title: "BTC wallet receive",
};

export default function WalletReceivePlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive (coming soon)</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section will show your next on-chain receiving address and QR codes once the feature is available.
      </CardContent>
    </Card>
  );
}
