import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { BtcpayModule } from './btcpay/btcpay.module';
import { InvoicesModule } from './invoices/invoices.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserEntity } from './auth/entities/user.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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

        const url = configService.get<string>('DATABASE_URL');
        if (url) {
          return {
            type: 'postgres',
            url,
            entities: [UserEntity, RefreshTokenEntity],
            synchronize: false,
            migrations: ['dist/migrations/*.js']
          } satisfies DataSourceOptions;
        }

        const host = configService.get<string>('POSTGRES_HOST') ?? 'localhost';
        const port = Number(configService.get<string>('POSTGRES_PORT') ?? '5432');
        const username = configService.get<string>('POSTGRES_USER') ?? 'paypay';
        const password = configService.get<string>('POSTGRES_PASSWORD') ?? 'paypay';
        const database = configService.get<string>('POSTGRES_DB') ?? 'paypay';
        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          entities: [UserEntity, RefreshTokenEntity],
          synchronize: false,
          migrations: ['dist/migrations/*.js']
        } satisfies DataSourceOptions;
      }
    }),
    AuthModule,
    BtcpayModule,
    InvoicesModule,
    HealthModule
  ]
})
export class AppModule {}
