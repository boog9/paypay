import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";

export const metadata: Metadata = {
  title: "BTC wallet send",
};

export default function WalletSendPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send (coming soon)</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section will allow you to craft on-chain Bitcoin transactions once sending is supported.
      </CardContent>
    </Card>
  );
}
