import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { CsrfGuard } from '../security/csrf.guard';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { isUuid } from '../shared/is-uuid';
import { BtcpayWalletService } from '../btcpay/btcpay.wallets.service';
import { ConfirmDangerousActionDto } from './dto/bitcoin-wallet-actions.dto';
import { OnchainWalletsService } from './onchain-wallets.service';

const ACTIONS = ['prune-history', 'clear-history', 'replace', 'remove'] as const;
export type BitcoinWalletActionId = (typeof ACTIONS)[number];
export interface BitcoinWalletActionsResponse {
  actions: BitcoinWalletActionId[];
}
const confirmValidationPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller('stores/:storeId/wallets/:walletCode/actions')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class BitcoinWalletActionsController {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly walletsService: OnchainWalletsService,
    private readonly btcpayWallets: BtcpayWalletService
  ) {}

  private normalizeWalletCode(walletCode: string): string {
    const value = typeof walletCode === 'string' ? walletCode.trim().toLowerCase() : '';

    if (value === 'btc' || value === 'bitcoin') {
      return 'btc';
    }

    throw new NotFoundException('Wallet not found or unsupported.');
  }

  @SkipThrottle()
  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async listActions(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('walletCode') walletCode: string
  ): Promise<BitcoinWalletActionsResponse> {
    const store = await this.requireStore(user, storeId);
    const normalizedWalletCode = this.normalizeWalletCode(walletCode);

    if (normalizedWalletCode !== 'btc') {
      throw new NotFoundException('Wallet not found or unsupported.');
    }

    let presence: Awaited<ReturnType<OnchainWalletsService['getPresence']>>;

    try {
      presence = await this.walletsService.getPresence(store);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { actions: [] } satisfies BitcoinWalletActionsResponse;
      }

      throw error;
    }

    if (presence.enabled !== true) {
      return { actions: [] } satisfies BitcoinWalletActionsResponse;
    }

    return { actions: [...ACTIONS] } satisfies BitcoinWalletActionsResponse;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('prune-history')
  async pruneHistory(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('walletCode') walletCode: string
  ): Promise<{ status: 'ok' }> {
    const store = await this.requireStore(user, storeId);
    const normalizedWalletCode = this.normalizeWalletCode(walletCode);
    await this.btcpayWallets.pruneWalletTransactions(store.btcpayStoreId ?? store.id, normalizedWalletCode, { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('clear-history')
  async clearHistory(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('walletCode') walletCode: string
  ): Promise<{ status: 'ok' }> {
    const store = await this.requireStore(user, storeId);
    const normalizedWalletCode = this.normalizeWalletCode(walletCode);
    await this.btcpayWallets.clearWalletTransactions(store.btcpayStoreId ?? store.id, normalizedWalletCode, { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('replace')
  async replaceWallet(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('walletCode') walletCode: string,
    @Body(confirmValidationPipe) _body: ConfirmDangerousActionDto
  ): Promise<{ status: 'ok' }> {
    void _body;
    const store = await this.requireStore(user, storeId);
    const normalizedWalletCode = this.normalizeWalletCode(walletCode);
    await this.btcpayWallets.replaceWallet(store.btcpayStoreId ?? store.id, normalizedWalletCode, { store });
    return { status: 'ok' } as const;
  }

  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @HttpCode(200)
  @Post('remove')
  async removeWallet(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Param('walletCode') walletCode: string,
    @Body(confirmValidationPipe) _body: ConfirmDangerousActionDto
  ): Promise<{ removed: true }> {
    void _body;
    const store = await this.requireStore(user, storeId);
    const normalizedWalletCode = this.normalizeWalletCode(walletCode);
    await this.btcpayWallets.removeWallet(store.btcpayStoreId ?? store.id, normalizedWalletCode, { store });
    return { removed: true } as const;
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
