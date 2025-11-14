import DashboardClient from "./_client";
import { getWalletPresence } from "../_lib/get-wallet-presence";

type PageProps = { params: Promise<{ storeId: string }> };

export default async function StoreDashboardPage({ params }: PageProps) {
  const { storeId } = await params;
  const presence = await getWalletPresence(storeId);
  return <DashboardClient storeId={storeId} hasWallet={presence.hasWallet} />;
}
