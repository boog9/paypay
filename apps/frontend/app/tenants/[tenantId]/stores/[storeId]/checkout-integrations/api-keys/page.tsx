import type { ReactElement } from "react";
import { StoreFeaturePlaceholder } from "../../store-feature-placeholder";

async function ApiKeysPage(): Promise<ReactElement> {
  return (
    <StoreFeaturePlaceholder
      title="API Keys"
      description="Generate and rotate BTCPay Greenfield API keys scoped to this store. Portal automation will surface here soon."
      documentationUrl="https://docs.btcpayserver.org/GreenField/v1/"
      documentationLabel="Greenfield API reference"
    />
  );
}

export default ApiKeysPage as unknown as () => Promise<ReactElement>;
