import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HooksController } from './hooks.controller';
import { HooksService } from './hooks.service';
import { StoreEntity } from '../tenants/entities/store.entity';
import { SecurityModule } from '../security/security.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TypeOrmModule.forFeature([StoreEntity]), SecurityModule, TenantsModule],
  controllers: [HooksController],
  providers: [HooksService]
})
export class HooksModule {}
