import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function PullPaymentsPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Pull Payments & Payouts"
      description="Configure pull payments, approve payouts and automate disbursements from the BTCPay dashboard while portal
      workflows are shipping."
      documentationUrl="https://docs.btcpayserver.org/PullPayments/"
      documentationLabel="Pull payments & payouts guide"
    />
  );
}

export default PullPaymentsPage as unknown as () => Promise<ReactElement>;
