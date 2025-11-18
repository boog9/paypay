import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { CsrfGuard } from '../security/csrf.guard';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { isUuid } from '../shared/is-uuid';
import { BtcpayWalletService } from '../btcpay/btcpay.wallets.service';
import { ConfirmDangerousActionDto, RescanWalletBodyDto } from './dto/bitcoin-wallet-actions.dto';

const rescanValidationPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller('stores/:storeId/wallets/bitcoin/actions')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class BitcoinWalletActionsController {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly btcpayWallets: BtcpayWalletService
  ) {}

  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @HttpCode(202)
  @Post('rescan')
  async rescan(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body(rescanValidationPipe) dto: RescanWalletBodyDto
  ): Promise<{ status: 'ok' }> {
    const store = await this.requireStore(user, storeId);
    await this.btcpayWallets.rescanWallet(store.id, 'BTC', {
      store,
      startingIndex: dto.startingIndex,
      gapLimit: dto.gapLimit,
      batchSize: dto.batchSize
    });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('prune-history')
  async pruneHistory(@ReqUser() user: RequestUser, @Param('storeId') storeId: string): Promise<{ status: 'ok' }> {
    const store = await this.requireStore(user, storeId);
    await this.btcpayWallets.pruneWalletTransactions(store.id, 'BTC', { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('clear-history')
  async clearHistory(@ReqUser() user: RequestUser, @Param('storeId') storeId: string): Promise<{ status: 'ok' }> {
    const store = await this.requireStore(user, storeId);
    await this.btcpayWallets.clearWalletTransactions(store.id, 'BTC', { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('replace')
  async replaceWallet(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() _body: ConfirmDangerousActionDto
  ): Promise<{ status: 'ok' }> {
    void _body;
    const store = await this.requireStore(user, storeId);
    await this.btcpayWallets.replaceWallet(store.id, 'BTC', { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('remove')
  async removeWallet(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() _body: ConfirmDangerousActionDto
  ): Promise<{ status: 'ok' }> {
    void _body;
    const store = await this.requireStore(user, storeId);
    await this.btcpayWallets.removeWallet(store.id, 'BTC', { store });
    return { status: 'ok' } as const;
  }

  private async requireStore(user: RequestUser, storeId: string): Promise<ManagedStoreEntity> {
    const normalizedStoreId = typeof storeId === 'string' ? storeId.trim() : '';
    const normalizedUserId = typeof user.id === 'string' ? user.id.trim() : '';

    if (!normalizedStoreId || !normalizedUserId) {
      throw new UnauthorizedException('Store not found or inaccessible.');
    }

    const where = isUuid(normalizedStoreId)
      ? [
          { id: normalizedStoreId, userId: normalizedUserId },
          { btcpayStoreId: normalizedStoreId, userId: normalizedUserId }
        ]
      : [{ btcpayStoreId: normalizedStoreId, userId: normalizedUserId }];

    const store = await this.storesRepository.findOne({ where });

    if (!store) {
      throw new NotFoundException('Store not found or inaccessible.');
    }

    return store;
  }
}
