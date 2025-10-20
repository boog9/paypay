import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { ManagedStoreEntity } from './managed-store.entity';
import { SecurityModule } from '../security/security.module';
import { BtcpayModule } from '../btcpay/btcpay.module';
import { UserEntity } from '../auth/entities/user.entity';
import { IdempotencyKeyEntity } from '../tenants/entities/idempotency-key.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManagedStoreEntity, UserEntity, IdempotencyKeyEntity]),
    SecurityModule,
    BtcpayModule,
    AuthModule,
  ],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService],
})
export class StoresModule {}
