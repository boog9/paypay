import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { BtcpayModule } from '../btcpay/btcpay.module';
import { AuthModule } from '../auth/auth.module';
import { OnchainWalletsController } from './onchain-wallets.controller';
import { WalletsController } from './wallets.controller';
import { LegacyOnchainWalletsController } from './legacy-onchain-wallets.controller';
import { OnchainWalletReadService } from './onchain-wallet-read.service';
import { OnchainWalletEntity } from './onchain-wallet.entity';
import { OnchainWalletsService } from './onchain-wallets.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManagedStoreEntity, OnchainWalletEntity]), BtcpayModule, AuthModule],
  controllers: [LegacyOnchainWalletsController, OnchainWalletsController, WalletsController],
  providers: [OnchainWalletReadService, OnchainWalletsService]
})
export class WalletsModule {}
