import { redirect } from "next/navigation";

import { bffFetch } from "@/lib/bff-fetch";
import type { WalletPresenceDTO } from "../_lib/get-wallet-presence";

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
  const wizardPath = `/stores/${normalizedStoreId}/wallets/btc/wizard`;

  let response: Response | null = null;
  try {
    response = await bffFetch(`/api/stores/${normalizedStoreId}/wallets/btc/presence`, {
      cache: "no-store",
    });
  } catch {
    response = null;
  }

  if (!response) {
    redirect(transactionsPath);
  }

  if (response.status === 401) {
    redirect("/sign-in?reason=session-expired");
  }

  if (response.status === 403) {
    redirect(transactionsPath);
  }

  if (response.status === 404) {
    redirect(wizardPath);
  }

  if (!response.ok) {
    redirect(transactionsPath);
  }

  const payload = (await response.json()) as unknown;
  let hasWallet = false;
  if (payload && typeof payload === "object") {
    const { hasWallet: presenceFlag, derivationScheme } = payload as Partial<WalletPresenceDTO>;
    hasWallet =
      presenceFlag === true ||
      (typeof derivationScheme === "string" && derivationScheme.length > 0);
  }

  redirect(hasWallet ? transactionsPath : wizardPath);
}
