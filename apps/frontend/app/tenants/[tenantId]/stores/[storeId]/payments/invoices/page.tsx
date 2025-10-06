import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function InvoicesPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="Invoices"
      description="Issue, monitor and mark invoices as paid directly from BTCPay while portal analytics are being built."
      documentationUrl="https://docs.btcpayserver.org/Invoices/"
      documentationLabel="BTCPay invoices guide"
    />
  );
}

export default InvoicesPage as unknown as () => Promise<ReactElement>;
