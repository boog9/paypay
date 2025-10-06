import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../store-feature-placeholder";

async function DashboardPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Dashboard"
      description="Wallet balances, invoice statistics and crowdfund summaries will surface here."
      documentationUrl="https://docs.btcpayserver.org/CreateStore/#store-dashboard"
      documentationLabel="Review BTCPay dashboard docs"
    />
  );
}

export default DashboardPage as unknown as () => Promise<ReactElement>;
