import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function ReportingPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Reporting"
      description="Aggregate invoices, payouts and on-chain activity directly from BTCPay until in-portal analytics are ready."
      documentationUrl="https://docs.btcpayserver.org/Accounting/"
      documentationLabel="BTCPay accounting documentation"
    />
  );
}

export default ReportingPage as unknown as () => Promise<ReactElement>;
