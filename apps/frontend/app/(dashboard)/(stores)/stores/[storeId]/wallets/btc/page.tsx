import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ storeId: string }>;
};

export default async function BitcoinWalletRedirectPage({ params }: PageProps) {
  const { storeId } = await params;
  redirect(`/stores/${storeId}/wallets/btc/transactions`);
}
