import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { getWalletPresence } from "@/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence";
import type { WalletPresenceResult } from "@/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence";

export const metadata: Metadata = {
  title: "BTC wallet receive",
};

type PageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function WalletReceivePlaceholder({ params }: PageProps) {
  const { storeId } = await params;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";

  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const dashboardPath = `/stores/${normalizedStoreId}/dashboard`;
  const presence: WalletPresenceResult = await getWalletPresence(normalizedStoreId);

  if (presence.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (presence.status === 403) {
    redirect(dashboardPath);
  }

  if (presence.status === 404 || (presence.status === 200 && !presence.hasWallet)) {
    redirect(dashboardPath);
  }

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
