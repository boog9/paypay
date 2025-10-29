import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { BtcpayModule } from './btcpay/btcpay.module';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './auth/entities/user.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';
import { TenantEntity } from './tenants/entities/tenant.entity';
import { StoreEntity } from './tenants/entities/store.entity';
import { AuditLogEntity } from './tenants/entities/audit-log.entity';
import { IdempotencyKeyEntity } from './tenants/entities/idempotency-key.entity';
import { ManagedStoreEntity } from './stores/managed-store.entity';
import { ManagedStoreWalletEntity } from './wallets/entities/managed-store-wallet.entity';
import { TenantsModule } from './tenants/tenants.module';
import { HooksModule } from './hooks/hooks.module';
import { HealthController } from './health.controller';
import { StoresModule } from './stores/stores.module';
import { WalletsModule } from './wallets/wallets.module';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Request } from 'express';
import { SecurityModule } from './security/security.module';
import { CsrfGuard } from './security/csrf.guard';
import { AppThrottlerGuard } from './app.throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: process.env.NODE_ENV === 'production' ? [] : ['.env']
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: [
            'req',
            'res',
            'req.headers.authorization',
            'req.headers.Authorization',
            'req.headers.apikey',
            'req.headers.apiKey',
            'req.headers["api-key"]',
            'authorization',
            'Authorization',
            'req.headers.cookie',
            'req.headers["x-csrf-token"]',
            'req.headers["idempotency-key"]',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.token',
            'apiKey',
            'apikey',
            'ciphertext',
            'dek_wrapped',
            'webhook_secret',
            'webhookSecret',
            'req.headers["btcpay-sig"]',
            'req.headers["btcpay-delivery"]',
            'req.body',
            'res.body'
          ],
          remove: true
        },
        customSuccessMessage: (_req, res) => `request completed with ${res.statusCode}`,
        customErrorMessage: (_req, res) => `request failed with ${res.statusCode}`,
        customLogLevel: (_req, res, err) => {
          if (err) {
            return 'error';
          }
          if (res.statusCode >= 500) {
            return 'error';
          }
          if (res.statusCode >= 400) {
            return 'warn';
          }
          return 'info';
        },
        customProps: (
          req: Request,
          res: ServerResponse<IncomingMessage>
        ) => ({
          statusCode: res.statusCode,
          method: req.method ?? 'UNKNOWN',
          path: req.originalUrl ?? req.url ?? 'UNKNOWN'
        })
      }
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'burst', ttl: 2_000, limit: 30 },
        { name: 'minute', ttl: 60_000, limit: 180 },
        { name: 'hour', ttl: 3_600_000, limit: 3_000 },
        { name: 'login', ttl: 60_000, limit: 5 },
        { name: 'refresh', ttl: 60_000, limit: 30 },
        { name: 'uiBurst', ttl: 30_000, limit: 600 }
      ],
      skipIf: (ctx) => {
        const req = ctx.switchToHttp().getRequest<Request>();
        const m = req.method;
        const p = req.originalUrl ?? req.url ?? '';
        if (m === 'OPTIONS' || m === 'HEAD') return true;
        return (
          p.startsWith('/api/auth/csrf') ||
          p.startsWith('/api/auth/csrf-token') ||
          p.startsWith('/api/auth/me') ||
          p.startsWith('/health') ||
          p.startsWith('/readyz')
        );
      }
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const dbType = configService.get<string>('DB_TYPE');
        if (nodeEnv === 'test' || dbType === 'sqlite') {
          const database = configService.get<string>('DB_DATABASE') ?? ':memory:';
          return {
            type: 'sqlite',
            database,
            entities: [
              UserEntity,
              RefreshTokenEntity,
              TenantEntity,
              StoreEntity,
              AuditLogEntity,
              IdempotencyKeyEntity,
              ManagedStoreEntity,
              ManagedStoreWalletEntity
            ],
            synchronize: true,
            dropSchema: true,
            logging: false
          } satisfies DataSourceOptions;
        }

        const baseOptions = {
          type: 'postgres',
          entities: [
            UserEntity,
            RefreshTokenEntity,
            TenantEntity,
            StoreEntity,
            AuditLogEntity,
            IdempotencyKeyEntity,
            ManagedStoreEntity,
            ManagedStoreWalletEntity
          ],
          synchronize: false,
          migrations: ['dist/migrations/*.js'],
          migrationsRun: true
        } satisfies Partial<DataSourceOptions>;

        const url = configService.get<string>('DATABASE_URL');
        if (url) {
          return {
            ...baseOptions,
            url
          } satisfies DataSourceOptions;
        }

        const host = configService.getOrThrow<string>('POSTGRES_HOST');
        const portRaw = configService.getOrThrow<string>('POSTGRES_PORT');
        const port = Number(portRaw);
        if (Number.isNaN(port)) {
          throw new Error('POSTGRES_PORT must be a valid number');
        }
        const username = configService.getOrThrow<string>('POSTGRES_USER');
        const password = configService.getOrThrow<string>('POSTGRES_PASSWORD');
        const database = configService.getOrThrow<string>('POSTGRES_DB');

        return {
          ...baseOptions,
          host,
          port,
          username,
          password,
          database
        } satisfies DataSourceOptions;
      }
    }),
    AuthModule,
    SecurityModule,
    BtcpayModule,
    TenantsModule,
    HooksModule,
    StoresModule,
    WalletsModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard
    },
  ]
})
export class AppModule {}
