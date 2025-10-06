import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function PaymentRequestsPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Payment Requests"
      description="Manage long-lived payment requests, reminders and public donation pages using the BTCPay interface."
      documentationUrl="https://docs.btcpayserver.org/PaymentRequests/"
      documentationLabel="Payment requests documentation"
    />
  );
}

export default PaymentRequestsPage as unknown as () => Promise<ReactElement>;
