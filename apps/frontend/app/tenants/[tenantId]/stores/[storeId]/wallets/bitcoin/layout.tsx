import type { ReactNode } from "react";
import { WalletNavigation } from "./wallet-navigation";

interface BitcoinWalletLayoutParams {
  tenantId: string;
  storeId: string;
}

interface BitcoinWalletLayoutProps {
  children: ReactNode;
  params: Promise<BitcoinWalletLayoutParams>;
}

export default async function BitcoinWalletLayout({
  children,
  params
}: BitcoinWalletLayoutProps) {
  const { tenantId, storeId } = await params;
  const basePath = `/tenants/${tenantId}/stores/${storeId}/wallets/bitcoin`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">Bitcoin Wallet</h2>
        <p className="text-sm text-muted-foreground">
          Review transactions, manage spending and keep your BTCPay on-chain wallet in sync.
        </p>
      </div>
      <WalletNavigation basePath={basePath} />
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
