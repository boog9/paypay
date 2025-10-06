import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function BitcoinWalletPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Bitcoin Wallet"
      description="Connect your on-chain wallet, review balances and manage derivation schemes directly from the BTCPay wallet UI."
      documentationUrl="https://docs.btcpayserver.org/WalletSetup/"
      documentationLabel="BTCPay wallet setup guide"
    />
  );
}

export default BitcoinWalletPage as unknown as () => Promise<ReactElement>;
