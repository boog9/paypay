import { redirect } from "next/navigation";

import { bffFetch } from "../../../../../../../../lib/bff-fetch";

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    response = (await bffFetch(`/api/stores/${normalizedStoreId}/wallets/btc`)) as Response;
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

  const payload = (await response.json()) as { hasWallet?: unknown } | null;
  const hasWallet = Boolean(payload && typeof payload === "object" && payload.hasWallet === true);
  redirect(hasWallet ? transactionsPath : wizardPath);
}
