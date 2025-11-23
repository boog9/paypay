import { redirect } from "next/navigation";

import { getWalletPresence } from "@/app/(dashboard)/(stores)/stores/[storeId]/_lib/get-wallet-presence";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function BitcoinWalletRedirectPage({ params }: PageProps) {
  const { storeId } = await params;
  const normalizedStoreId = typeof storeId === "string" ? storeId.trim() : "";
  if (!normalizedStoreId) {
    redirect("/stores");
  }

  const transactionsPath = `/stores/${normalizedStoreId}/wallets/btc/transactions`;
  const dashboardPath = `/stores/${normalizedStoreId}/dashboard`;
  const presence = await getWalletPresence(normalizedStoreId);

  if (presence.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (presence.status === 403) {
    redirect(dashboardPath);
  }

  if (presence.status === 404) {
    redirect(dashboardPath);
  }

  if (presence.status === 200 && !presence.hasWallet) {
    redirect(dashboardPath);
  }

  redirect(transactionsPath);
}
