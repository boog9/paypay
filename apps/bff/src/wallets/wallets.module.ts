import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { ManagedStoreWalletEntity } from './entities/managed-store-wallet.entity';
import { BtcpayModule } from '../btcpay/btcpay.module';
import { AuthModule } from '../auth/auth.module';
import { OnchainWalletsController } from './onchain-wallets.controller';
import { OnchainWalletsService } from './onchain-wallets.service';
import { WalletsController } from './wallets.controller';
import { OnchainWalletReadService } from './onchain-wallet-read.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedStoreEntity, ManagedStoreWalletEntity]), BtcpayModule, AuthModule],
  controllers: [OnchainWalletsController, WalletsController],
  providers: [OnchainWalletsService, OnchainWalletReadService]
})
export class WalletsModule {}
