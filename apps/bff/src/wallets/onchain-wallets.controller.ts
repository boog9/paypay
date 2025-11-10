import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  Put,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { OnchainWalletsService } from './onchain-wallets.service';
import { toWalletPresenceDto, WalletPresenceDto } from './dto/wallet-presence.dto';
import { UpdateBitcoinWalletDto } from './dto/update-bitcoin-wallet.dto';
import { BtcpayPaymentMethodsService } from '../btcpay/btcpay.payment-methods.service';
import { isUuid } from '../shared/is-uuid';

interface BitcoinWalletMetadataDto {
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
}

@Controller()
export class OnchainWalletsController {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly walletsService: OnchainWalletsService,
    private readonly paymentMethods: BtcpayPaymentMethodsService
  ) {}

  @Get('stores/:storeId/wallets/btc/presence')
  @UseGuards(JwtAuthGuard)
  @Throttle({ uiBurst: { limit: 600, ttl: seconds(30) } })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async getPresence(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<WalletPresenceDto> {
    const store = await this.requireStore(user, storeId);
    const presence = await this.walletsService.getPresence(store);
    return toWalletPresenceDto(presence);
  }

  @Get('stores/:storeId/wallets/bitcoin')
  @UseGuards(JwtAuthGuard)
  @Throttle({ uiBurst: { limit: 600, ttl: seconds(30) } })
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async getMetadata(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<BitcoinWalletMetadataDto> {
    const store = await this.requireStore(user, storeId);
    const metadata = await this.walletsService.getMetadata(store);
    return {
      enabled: metadata.enabled,
      derivationScheme: metadata.derivationScheme,
      accountKeyPath: metadata.accountKeyPath,
      masterFingerprint: metadata.masterFingerprint,
      label: metadata.label
    } satisfies BitcoinWalletMetadataDto;
  }

  @Put('stores/:storeId/wallets/bitcoin')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async configure(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string,
    @Body() dto: UpdateBitcoinWalletDto
  ): Promise<void> {
    const store = await this.requireStore(user, storeId);
    this.validateNetwork(dto);

    const { forStorage: masterFingerprintForStorage } = this.resolveFingerprints(
      dto.derivationScheme,
      dto.masterFingerprint
    );

    try {
      await this.paymentMethods.updateOnchainPaymentMethod(
        {
          storeId: store.btcpayStoreId,
          derivationScheme: dto.derivationScheme,
          allowAccountKeyPath: false,
          enabled: true
        },
        { store }
      );
    } catch (error) {
      this.rethrowBtcpayError(error);
    }

    await this.walletsService.upsertFromBtcpay(store, {
      derivationScheme: dto.derivationScheme,
      accountKeyPath: dto.accountKeyPath ?? null,
      masterFingerprint: masterFingerprintForStorage,
      label: dto.label ?? null
    });
  }

  @Delete('stores/:storeId/wallets/bitcoin')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async disable(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<void> {
    const store = await this.requireStore(user, storeId);

    try {
      const remote = await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
        store
      });
      if (remote.enabled && remote.config?.derivationScheme) {
        await this.paymentMethods.updateOnchainPaymentMethod(
          {
            storeId: store.btcpayStoreId,
            derivationScheme: remote.config.derivationScheme,
            allowAccountKeyPath: false,
            enabled: false
          },
          { store }
        );
      }
    } catch (error) {
      this.rethrowBtcpayError(error);
    }

    await this.walletsService.disable(store);
  }

  private async requireStore(user: RequestUser, storeId: string): Promise<ManagedStoreEntity> {
    const normalizedStoreId = typeof storeId === 'string' ? storeId.trim() : '';
    if (!normalizedStoreId) {
      throw new UnprocessableEntityException('Store identifier is required.');
    }

    const userId = typeof user.id === 'string' ? user.id.trim() : '';
    if (!userId) {
      throw new UnauthorizedException('Authentication required.');
    }

    const where: FindOptionsWhere<ManagedStoreEntity>[] = isUuid(normalizedStoreId)
      ? [
          { id: normalizedStoreId, userId },
          { btcpayStoreId: normalizedStoreId, userId }
        ]
      : [{ btcpayStoreId: normalizedStoreId, userId }];

    const store = await this.storesRepository.findOne({ where });

    if (!store) {
      throw new UnauthorizedException('Store not found or inaccessible.');
    }

    return store;
  }

  private validateNetwork(dto: UpdateBitcoinWalletDto): void {
    const network = String(process.env.NBITCOIN_NETWORK ?? '').trim().toLowerCase();
    if (network !== 'testnet') {
      return;
    }

    const derivation = dto.derivationScheme.trim();
    const lowered = derivation.toLowerCase();
    const containsMainnetPrefixes = /(xpub|ypub|zpub)/u.test(lowered);
    if (containsMainnetPrefixes) {
      throw new UnprocessableEntityException('Testnet wallets must not use mainnet extended keys.');
    }

    if (!/(tpub|upub|vpub)/u.test(lowered)) {
      throw new UnprocessableEntityException('Testnet wallets must use tpub, upub, or vpub extended keys.');
    }

    const keyPath = dto.accountKeyPath?.trim();
    if (keyPath) {
      const bip84 = /^m\/84'\/1'\/\d+'(?:\/.*)?$/u;
      const bip86 = /^m\/86'\/1'\/\d+'(?:\/.*)?$/u;
      if (!bip84.test(keyPath) && !bip86.test(keyPath)) {
        throw new UnprocessableEntityException(
          "Account key path must start with m/84'/1' or m/86'/1'."
        );
      }
    }
  }

  private extractFingerprintFromDescriptor(derivationScheme: string): string | null {
    if (typeof derivationScheme !== 'string') {
      return null;
    }

    const match = derivationScheme.match(/\[\s*([0-9a-fA-F]{8})\//u);
    if (!match || !match[1]) {
      return null;
    }

    return match[1].toUpperCase();
  }

  private resolveFingerprints(
    derivationScheme: string,
    masterFingerprint: string | null | undefined
  ): { forBtcpay: string | undefined; forStorage: string | null } {
    if (masterFingerprint === null) {
      return { forBtcpay: undefined, forStorage: null };
    }

    if (typeof masterFingerprint === 'string') {
      const normalized = masterFingerprint.trim().toUpperCase();
      return { forBtcpay: normalized, forStorage: normalized };
    }

    const extracted = this.extractFingerprintFromDescriptor(derivationScheme);
    if (!extracted) {
      return { forBtcpay: undefined, forStorage: null };
    }

    return { forBtcpay: extracted, forStorage: extracted };
  }

  private rethrowBtcpayError(error: unknown): never {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const message = this.extractMessage(error);
      if (status >= 500) {
        throw new BadGatewayException(message);
      }
      if (status === 401 || status === 403) {
        throw error;
      }
      throw new UnprocessableEntityException(message);
    }

    throw error instanceof Error ? error : new BadGatewayException('BTCPay request failed');
  }

  private extractMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response && 'message' in response) {
      const payload = (response as { message?: unknown }).message;
      if (typeof payload === 'string') {
        return payload;
      }
      if (Array.isArray(payload)) {
        return payload.map((entry) => String(entry)).join(', ');
      }
    }
    return 'BTCPay request failed.';
  }
}
