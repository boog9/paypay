import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity } from './entities/tenant.entity';
import { StoreEntity } from './entities/store.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { SecurityModule } from '../security/security.module';
import { BtcpayModule } from '../btcpay/btcpay.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantEntity, StoreEntity, AuditLogEntity, IdempotencyKeyEntity]),
    SecurityModule,
    BtcpayModule
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService]
})
export class TenantsModule {}
