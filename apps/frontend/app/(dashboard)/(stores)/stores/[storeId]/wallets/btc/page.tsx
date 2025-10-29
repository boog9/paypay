import { redirect } from "next/navigation";

import { bffFetch } from "@/lib/bff-fetch";

type WalletPresence = {
  hasWallet: boolean;
  derivationScheme: string | null;
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ storeId: string }>;
};

const parseWalletPresence = (value: unknown): WalletPresence | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { hasWallet, enabled, derivationScheme } = record;

  if (typeof hasWallet !== "boolean" || typeof enabled !== "boolean") {
    return null;
  }

  if (derivationScheme !== null && typeof derivationScheme !== "string") {
    return null;
  }

  return {
    hasWallet,
    derivationScheme: derivationScheme ?? null,
  };
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

  const payload: unknown = await response.json();
  const walletPresence = parseWalletPresence(payload);
  if (!walletPresence) {
    redirect(wizardPath);
  }

  const { hasWallet: presenceFlag, derivationScheme } = walletPresence;
  const hasWallet =
    presenceFlag === true ||
    (typeof derivationScheme === "string" && derivationScheme.length > 0);

  redirect(hasWallet ? transactionsPath : wizardPath);
}
