import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { ReqUser, RequestUser } from '../auth/decorators/req-user.decorator';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { OnchainWalletsService } from './onchain-wallets.service';
import { toWalletPresenceDto, WalletPresenceDto } from './dto/wallet-presence.dto';
import { OnchainConfigBodyDto } from './dto/onchain-config.dto';
import {
  BtcpayPaymentMethodsService,
  type OnchainConfigResponse,
  type SafeOnChainWalletSettings
} from '../btcpay/btcpay.payment-methods.service';
import { BtcpayWalletService } from '../btcpay/btcpay.wallets.service';
import { isUuid } from '../shared/is-uuid';

interface BitcoinWalletMetadataDto {
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
}

interface BitcoinWalletSettingsDto extends SafeOnChainWalletSettings {
  hasOnChainPaymentMethod: boolean;
}

@Controller()
export class OnchainWalletsController {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly walletsService: OnchainWalletsService,
    private readonly paymentMethods: BtcpayPaymentMethodsService,
    private readonly btcpayWallets: BtcpayWalletService
  ) {}

  @Get('stores/:storeId/wallets/btc/presence')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async getPresence(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<WalletPresenceDto> {
    const store = await this.requireStore(user, storeId);
    const presence = await this.btcpayWallets.getBitcoinWalletPresence(store.btcpayStoreId, {
      store,
      host: store.btcpayHost
    });
    return toWalletPresenceDto(presence.hasWallet);
  }

  @Get('stores/:storeId/wallets/bitcoin/onchain/settings')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie')
  async getOnchainSettings(
    @ReqUser() user: RequestUser,
    @Param('storeId') storeId: string
  ): Promise<BitcoinWalletSettingsDto> {
    const store = await this.requireStore(user, storeId);
    const settings = await this.paymentMethods.getOnchainWalletSettings(store.btcpayStoreId, 'BTC', {
      store,
      host: store.btcpayHost,
    });

    return {
      hasOnChainPaymentMethod: true,
      ...settings
    } satisfies BitcoinWalletSettingsDto;
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
    @Body() dto: OnchainConfigBodyDto
  ): Promise<void> {
    const store = await this.requireStore(user, storeId);
    this.validateNetwork(dto);

    const fingerprint = dto.rootFingerprint.trim().toUpperCase();

    try {
      await this.paymentMethods.saveOnchain(
        store.btcpayStoreId,
        {
          tpub: dto.tpub,
          rootFingerprint: fingerprint,
          accountKeyPath: dto.accountKeyPath
        },
        { store, enabled: true }
      );
    } catch (error) {
      this.rethrowBtcpayError(error);
    }

    let remoteConfig: OnchainConfigResponse | null = null;
    try {
      remoteConfig = await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', { store });
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      remoteConfig = null;
    }

    const metadata = remoteConfig?.config
      ? {
          derivationScheme:
            remoteConfig.config.derivationScheme ?? remoteConfig.config.accountKey ?? dto.tpub,
          accountKeyPath: remoteConfig.config.accountKeyPath ?? dto.accountKeyPath ?? null,
          masterFingerprint: remoteConfig.config.masterFingerprint ?? fingerprint,
          label: remoteConfig.config.label ?? null
        }
      : {
          derivationScheme: dto.tpub,
          accountKeyPath: dto.accountKeyPath ?? null,
          masterFingerprint: fingerprint,
          label: null
        };

    await this.walletsService.upsertFromBtcpay(store, metadata);
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

      if (remote.enabled) {
        const tpub = remote.config?.accountKey ?? remote.config?.derivationScheme ?? '';
        const accountKeyPath = remote.config?.accountKeyPath ?? '';
        const rootFingerprint = remote.config?.masterFingerprint ?? '';

        if (tpub && accountKeyPath && rootFingerprint) {
          await this.paymentMethods.saveOnchain(
            store.btcpayStoreId,
            { tpub, rootFingerprint, accountKeyPath },
            { store, enabled: false }
          );
        } else {
          await this.paymentMethods.saveOnchain(store.btcpayStoreId, null, { store, enabled: false });
        }
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

  private validateNetwork(dto: OnchainConfigBodyDto): void {
    const network = String(process.env.NBITCOIN_NETWORK ?? '').trim().toLowerCase();
    if (network !== 'testnet') {
      return;
    }

    const derivation = dto.tpub.trim();
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
      const bip84 = /^84'\/1'\/\d+'(?:\/.*)?$/u;
      const bip86 = /^86'\/1'\/\d+'(?:\/.*)?$/u;
      if (!bip84.test(keyPath) && !bip86.test(keyPath)) {
        throw new UnprocessableEntityException(
          "Account key path must start with 84'/1' or 86'/1'."
        );
      }
    }
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
