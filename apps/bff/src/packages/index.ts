import { Module, Global } from "@nestjs/common";
import { BtcpyClient } from "@paypay/sdk";

@Global()
@Module({
  providers: [
    {
      provide: BtcpyClient,
      useFactory: () =>
        new BtcpyClient({
          baseUrl: process.env.BTCPAY_BASE_URL ?? "https://btcpay.example.com",
          defaultApiKey: process.env.BTCPAY_API_KEY
        })
    }
  ],
  exports: [BtcpyClient]
})
export class BtcpyClientModule {}

export { BtcpyClient } from "@paypay/sdk";
