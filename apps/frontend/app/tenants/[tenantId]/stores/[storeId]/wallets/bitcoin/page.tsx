import { redirect } from "next/navigation";

interface BitcoinWalletPageParams {
  tenantId: string;
  storeId: string;
}

export default async function BitcoinWalletPage({
  params
}: {
  params: Promise<BitcoinWalletPageParams>;
}) {
  const { tenantId, storeId } = await params;
  redirect(`/tenants/${tenantId}/stores/${storeId}/wallets/bitcoin/transactions`);
}
