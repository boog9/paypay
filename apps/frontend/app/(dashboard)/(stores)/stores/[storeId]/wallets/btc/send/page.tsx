import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../../../components/ui/card";
import { getWalletPresence } from "@/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence";

export const metadata: Metadata = {
  title: "BTC wallet send",
};

type PageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function WalletSendPlaceholder({ params }: PageProps) {
  const { storeId } = await params;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";

  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const dashboardPath = `/stores/${normalizedStoreId}/dashboard`;
  const presence = await getWalletPresence(normalizedStoreId);

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
        <CardTitle>Send (coming soon)</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section will allow you to craft on-chain Bitcoin transactions once sending is supported.
      </CardContent>
    </Card>
  );
}
