import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BtcpayPaymentMethodsService,
  DEFAULT_PREVIEW_ADDRESS_COUNT,
  OnchainPreviewRequest,
  OnchainPreviewResponse,
  UpdateOnchainPaymentMethodPayload
} from '../btcpay/btcpay.payment-methods.service';
import { BtcpayKeysService } from '../btcpay/btcpay.keys.service';
import { isBTCPayAuthError, isBTCPayUpstreamError } from '../btcpay/btcpay.errors';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { INVALID_DERIVATION_MESSAGE, PreviewOnchainDto, UpdateOnchainDto } from './dto/preview-onchain.dto';
import { normalizeEmail } from '../auth/email.utils';
import { ManagedStoreWalletEntity } from './entities/managed-store-wallet.entity';

interface WalletUserContext {
  id: string | null;
  email: string | null;
}

export interface OnchainWalletStatusReadModel {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  enabled: boolean;
  connected: boolean;
  missingLocalMeta: boolean;
  config: {
    derivationScheme: string | null;
    accountKeyPath: string | null;
    masterFingerprint: string | null;
    label: string | null;
  };
}

const BTC_ONCHAIN_PAYMENT_METHOD_ID = 'BTC-OnChain';

@Injectable()
export class OnchainWalletsService {
  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    @InjectRepository(ManagedStoreWalletEntity)
    private readonly walletsRepository: Repository<ManagedStoreWalletEntity>,
    private readonly paymentMethods: BtcpayPaymentMethodsService,
    private readonly keysService: BtcpayKeysService
  ) {}

  async preview(
    userContext: WalletUserContext,
    storeId: string,
    dto: PreviewOnchainDto
  ): Promise<OnchainPreviewResponse> {
    const userId = this.requireUserId(userContext.id);
    const store = await this.requireStore(userId, storeId);
    const previewRequest = this.buildPreviewRequest(dto);
    const preview = await this.paymentMethods.previewOnchain(store.btcpayStoreId, 'BTC', previewRequest, { store });
    const requestedAmount = this.normalizeRequestedAmount(dto.amount);
    return {
      ...preview,
      addresses: this.normalizePreviewAddresses(preview.addresses, requestedAmount)
    };
  }

  async getConfig(
    userContext: WalletUserContext,
    storeId: string
  ): Promise<OnchainWalletStatusReadModel> {
    const userId = this.requireUserId(userContext.id);
    const store = await this.requireStore(userId, storeId);
    const paymentMethodId = BTC_ONCHAIN_PAYMENT_METHOD_ID;
    const [status, wallet] = await Promise.all([
      this.paymentMethods.getOnchainMethodStatus(store.btcpayStoreId, paymentMethodId, { store }),
      this.walletsRepository.findOne({ where: { storeId: store.id, paymentMethodId } })
    ]);

    const enabled = Boolean(status?.enabled);
    const resolvedPaymentMethodId = status?.paymentMethodId?.trim() || paymentMethodId;

    return {
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: resolvedPaymentMethodId,
      enabled,
      connected: enabled,
      missingLocalMeta: enabled && !wallet,
      config: this.normalizeLocalWallet(wallet)
    } satisfies OnchainWalletStatusReadModel;
  }

  async update(
    userContext: WalletUserContext,
    storeId: string,
    dto: UpdateOnchainDto
  ): Promise<void> {
    const userId = this.requireUserId(userContext.id);
    const userEmail = this.requireUserEmail(userContext.email);
    const store = await this.requireStore(userId, storeId);
    const payload: UpdateOnchainPaymentMethodPayload = this.buildUpdatePayload(dto);
    try {
      await this.keysService.withStoreSettingsWriteKey(
        store.btcpayStoreId,
        userEmail,
        async (apiKey) => {
          await this.paymentMethods.updateOnchainPaymentMethod(
            {
              storeId: store.btcpayStoreId,
              cryptoCode: 'BTC',
              derivationScheme: payload.config.derivationScheme,
              accountKeyPath: payload.config.accountKeyPath,
              masterFingerprint: payload.config.masterFingerprint,
              label: payload.config.label,
              enabled: payload.enabled
            },
            { store, apiKey }
          );
        },
        { host: store.btcpayHost }
      );

      await this.saveWalletMetadata(store, {
        paymentMethodId: BTC_ONCHAIN_PAYMENT_METHOD_ID,
        derivationScheme: payload.config.derivationScheme,
        accountKeyPath: payload.config.accountKeyPath ?? null,
        masterFingerprint: payload.config.masterFingerprint ?? null,
        label: payload.config.label ?? null
      });
    } catch (error) {
      if (isBTCPayAuthError(error)) {
        throw new UnauthorizedException('BTCPay authentication failed');
      }
      if (isBTCPayUpstreamError(error)) {
        throw new BadGatewayException('Upstream error');
      }
      throw error;
    }
  }

  private normalizeLocalWallet(
    wallet: ManagedStoreWalletEntity | null
  ): OnchainWalletStatusReadModel['config'] {
    if (!wallet) {
      return {
        derivationScheme: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      };
    }

    return {
      derivationScheme: wallet.derivationScheme ?? null,
      accountKeyPath: wallet.accountKeyPath ?? null,
      masterFingerprint: wallet.masterFingerprint ?? null,
      label: wallet.label ?? null
    };
  }

  private async saveWalletMetadata(
    store: ManagedStoreEntity,
    metadata: {
      paymentMethodId: string;
      derivationScheme: string;
      accountKeyPath: string | null;
      masterFingerprint: string | null;
      label: string | null;
    }
  ): Promise<void> {
    const derivationScheme = metadata.derivationScheme.trim();
    const accountKeyPath = metadata.accountKeyPath?.trim() || null;
    const masterFingerprint = metadata.masterFingerprint?.trim().toUpperCase() || null;
    const label = metadata.label?.trim() || null;

    const existing = await this.walletsRepository.findOne({
      where: { storeId: store.id, paymentMethodId: metadata.paymentMethodId }
    });

    if (!existing) {
      const entity = this.walletsRepository.create({
        storeId: store.id,
        paymentMethodId: metadata.paymentMethodId,
        derivationScheme,
        accountKeyPath,
        masterFingerprint,
        label
      });
      await this.walletsRepository.save(entity);
      return;
    }

    existing.derivationScheme = derivationScheme;
    existing.accountKeyPath = accountKeyPath;
    existing.masterFingerprint = masterFingerprint;
    existing.label = label;
    await this.walletsRepository.save(existing);
  }

  private buildPreviewRequest(dto: PreviewOnchainDto): OnchainPreviewRequest {
    return {
      amount: dto.amount,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: dto.accountKeyPath
      }
    };
  }

  private buildUpdatePayload(dto: UpdateOnchainDto): UpdateOnchainPaymentMethodPayload {
    return {
      enabled: dto.enabled ?? true,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: dto.accountKeyPath,
        label: dto.label,
        masterFingerprint: dto.masterFingerprint
      }
    };
  }

  private requireUserId(userId: string | null): string {
    if (!userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    const trimmed = userId.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    return trimmed;
  }

  private requireUserEmail(email: string | null): string {
    if (!email) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    const normalized = normalizeEmail(email);
    if (!normalized) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }
    return normalized;
  }

  private async requireStore(userId: string, storeId: string): Promise<ManagedStoreEntity> {
    const normalized = storeId.trim();
    if (!normalized) {
      throw new NotFoundException('Store not found');
    }
    const store = await this.storesRepository.findOne({
      where: { btcpayStoreId: normalized, userId }
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }

  private normalizePreviewAddresses(
    addresses: OnchainPreviewResponse['addresses'],
    expectedCount: number
  ): OnchainPreviewResponse['addresses'] {
    const normalizedCount = Number.isFinite(expectedCount) && expectedCount > 0
      ? Math.max(1, Math.trunc(expectedCount))
      : DEFAULT_PREVIEW_ADDRESS_COUNT;
    const limited = Array.isArray(addresses) ? addresses.slice(0, normalizedCount) : [];
    if (limited.length < normalizedCount) {
      throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE);
    }

    return limited.map((item, index) => {
      const itemIndex = typeof item.index === 'number' && Number.isFinite(item.index)
        ? Math.trunc(item.index)
        : index;
      if (typeof item.address !== 'string' || !item.address.trim()) {
        throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE);
      }

      const keyPath = item.keyPath && item.keyPath.trim() ? item.keyPath.trim() : `0/${itemIndex}`;

      return {
        address: item.address.trim(),
        index: itemIndex,
        keyPath
      };
    });
  }

  private normalizeRequestedAmount(amount: number | undefined): number {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return DEFAULT_PREVIEW_ADDRESS_COUNT;
    }
    const normalized = Math.max(1, Math.trunc(amount));
    return normalized;
  }
}
