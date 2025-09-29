import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard } from './auth/csrf.guard';
import { LoggerModule } from 'nestjs-pino';
import { BtcpayModule } from './btcpay/btcpay.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './auth/entities/user.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';
import { TenantEntity } from './tenants/entities/tenant.entity';
import { StoreEntity } from './tenants/entities/store.entity';
import { AuditLogEntity } from './tenants/entities/audit-log.entity';
import { IdempotencyKeyEntity } from './tenants/entities/idempotency-key.entity';
import { TenantsModule } from './tenants/tenants.module';
import { HooksModule } from './hooks/hooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-csrf-token"]',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.token',
            'req.headers["btcpay-sig"]',
            'req.headers["btcpay-delivery"]'
          ],
          remove: true
        }
      }
    }),
    ThrottlerModule.forRoot([{ ttl: 60, limit: 5 }]),
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
              IdempotencyKeyEntity
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
            IdempotencyKeyEntity
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

        const isProduction = nodeEnv === 'production';
        const host = isProduction
          ? configService.getOrThrow<string>('POSTGRES_HOST')
          : configService.get<string>('POSTGRES_HOST') ?? 'localhost';
        const port = isProduction
          ? Number(configService.getOrThrow<string>('POSTGRES_PORT'))
          : Number(configService.get<string>('POSTGRES_PORT') ?? '5432');
        const username = isProduction
          ? configService.getOrThrow<string>('POSTGRES_USER')
          : configService.get<string>('POSTGRES_USER') ?? 'paypay';
        const password = isProduction
          ? configService.getOrThrow<string>('POSTGRES_PASSWORD')
          : configService.get<string>('POSTGRES_PASSWORD') ?? 'paypay';
        const database = isProduction
          ? configService.getOrThrow<string>('POSTGRES_DB')
          : configService.get<string>('POSTGRES_DB') ?? 'paypay';

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
    BtcpayModule,
    HealthModule,
    TenantsModule,
    HooksModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard
    }
  ]
})
export class AppModule {}
