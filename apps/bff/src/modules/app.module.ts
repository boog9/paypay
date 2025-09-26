import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { StoresModule } from "./stores/stores.module";
import { PaymentsModule } from "./payments/payments.module";
import { AppsModule } from "./apps/apps.module";
import { WalletsModule } from "./wallets/wallets.module";
import { SettingsModule } from "./settings/settings.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DatabaseConfig } from "../common/database.config";
import { entities } from "../common/entities";
import { BtcpyClientModule } from "../packages";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "production",
      envFilePath: [".env", "../../infra/env/.env.example"]
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig
    }),
    TypeOrmModule.forFeature(entities),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD
      }
    }),
    BtcpyClientModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    StoresModule,
    PaymentsModule,
    AppsModule,
    WalletsModule,
    SettingsModule,
    WebhooksModule,
    NotificationsModule
  ]
})
export class AppModule {}
