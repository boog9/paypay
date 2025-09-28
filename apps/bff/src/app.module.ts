import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { BtcpayModule } from './btcpay/btcpay.module';
import { InvoicesModule } from './invoices/invoices.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './auth/entities/user.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';

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
            'req.body.token'
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
            entities: [UserEntity, RefreshTokenEntity],
            synchronize: true,
            dropSchema: true,
            logging: false
          } satisfies DataSourceOptions;
        }

        const baseOptions = {
          type: 'postgres',
          entities: [UserEntity, RefreshTokenEntity],
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
    InvoicesModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
