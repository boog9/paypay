import {
  BadGatewayException,
  ForbiddenException,
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
  OnchainPaymentMethodConfig,
  OnchainPreviewRequest,
  OnchainPreviewResponse,
  UpdateOnchainPaymentMethodPayload,
  canonicalPaymentMethodId
} from '../btcpay/btcpay.payment-methods.service';
import { BTC_ONCHAIN_PMID } from '../btcpay/btcpay.constants';
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
  metadata: {
    label: string | null;
    accountKeyPath: string | null;
    hasDerivationScheme: boolean;
    hasMasterFingerprint: boolean;
  };
  addressPreview: OnchainPreviewResponse['addresses'];
}

const BTC_ONCHAIN_PAYMENT_METHOD_ID = BTC_ONCHAIN_PMID;

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
      paymentMethodId: canonicalPaymentMethodId(preview.paymentMethodId, 'chain') || preview.paymentMethodId,
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
      this.walletsRepository.findOne({
        where: [
          { storeId: store.id, paymentMethodId },
          { storeId: store.id, paymentMethodId: 'BTC-OnChain' }
        ]
      })
    ]);

    const enabled = Boolean(status?.enabled);
    if (!enabled) {
      throw new NotFoundException('On-chain BTC payment method is not enabled for this store.');
    }

    let remoteConfig: OnchainPaymentMethodConfig | null = null;
    let limitedView = false;
    try {
      remoteConfig = await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
        store,
        includeConfig: true
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        limitedView = true;
      } else {
        throw error;
      }
    }

    const resolvedPaymentMethodId = canonicalPaymentMethodId(
      remoteConfig?.paymentMethodId ?? status?.paymentMethodId ?? paymentMethodId,
      'chain'
    ) || paymentMethodId;

    const preview = limitedView ? [] : await this.safePreviewAddresses(store);
    const metadata = this.buildMetadata(remoteConfig, wallet);

    const readModel: OnchainWalletStatusReadModel = {
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: resolvedPaymentMethodId,
      enabled: true,
      connected: true,
      missingLocalMeta: !wallet,
      metadata,
      addressPreview: preview
    };

    if (limitedView) {
      throw new ForbiddenException(readModel);
    }

    return readModel;
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
        if (error.status === 422) {
          throw new UnprocessableEntityException(error.message, { cause: error });
        }
        throw new BadGatewayException('Upstream error');
      }
      throw error;
    }
  }

  private normalizeLocalWallet(
    wallet: ManagedStoreWalletEntity | null
  ): OnchainWalletStatusReadModel['metadata'] {
    if (!wallet) {
      return {
        accountKeyPath: null,
        label: null,
        hasDerivationScheme: false,
        hasMasterFingerprint: false
      };
    }

    return {
      accountKeyPath: this.sanitizeString(wallet.accountKeyPath),
      label: this.sanitizeString(wallet.label),
      hasDerivationScheme: Boolean(this.sanitizeString(wallet.derivationScheme)),
      hasMasterFingerprint: Boolean(this.sanitizeString(wallet.masterFingerprint))
    };
  }

  private buildMetadata(
    remoteConfig: OnchainPaymentMethodConfig | null,
    wallet: ManagedStoreWalletEntity | null
  ): OnchainWalletStatusReadModel['metadata'] {
    const local = this.normalizeLocalWallet(wallet);
    const config = remoteConfig?.config ?? null;

    const record = config && typeof config === 'object' ? (config as Record<string, unknown>) : null;
    const remoteLabel = record ? this.sanitizeString(record.label) : null;
    const remoteAccountKeyPath = record ? this.sanitizeString(record.accountKeyPath) : null;
    const remoteDerivationScheme = record ? this.sanitizeString(record.derivationScheme) : null;
    const remoteRootFingerprint = record ? this.sanitizeString(record.rootFingerprint) : null;
    const remoteMasterFingerprint =
      remoteRootFingerprint ?? (record ? this.sanitizeString(record.masterFingerprint) : null);

    return {
      label: remoteLabel ?? local.label,
      accountKeyPath: remoteAccountKeyPath ?? local.accountKeyPath,
      hasDerivationScheme: Boolean(remoteDerivationScheme) || local.hasDerivationScheme,
      hasMasterFingerprint: Boolean(remoteMasterFingerprint) || local.hasMasterFingerprint
    };
  }

  private async safePreviewAddresses(
    store: ManagedStoreEntity
  ): Promise<OnchainPreviewResponse['addresses']> {
    try {
      const preview = await this.paymentMethods.previewOnchain(
        store.btcpayStoreId,
        'BTC',
        { amount: DEFAULT_PREVIEW_ADDRESS_COUNT },
        { store }
      );
      return Array.isArray(preview.addresses) ? preview.addresses.slice(0, DEFAULT_PREVIEW_ADDRESS_COUNT) : [];
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof ForbiddenException) {
        return [];
      }
      return [];
    }
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
    const hasDerivationScheme = Boolean(metadata.derivationScheme && metadata.derivationScheme.trim());
    const derivationSchemeMarker = hasDerivationScheme ? 'PRESENT' : null;
    const accountKeyPath = this.sanitizeString(metadata.accountKeyPath);
    const masterFingerprint = this.sanitizeString(metadata.masterFingerprint)?.toUpperCase() || null;
    const label = this.sanitizeString(metadata.label);

    const existing = await this.walletsRepository.findOne({
      where: [
        { storeId: store.id, paymentMethodId: metadata.paymentMethodId },
        { storeId: store.id, paymentMethodId: 'BTC-OnChain' }
      ]
    });

    if (!existing) {
      const entity = this.walletsRepository.create({
        storeId: store.id,
        paymentMethodId: metadata.paymentMethodId,
        derivationScheme: derivationSchemeMarker,
        accountKeyPath,
        masterFingerprint,
        label
      });
      await this.walletsRepository.save(entity);
      return;
    }

    existing.paymentMethodId = metadata.paymentMethodId;
    existing.derivationScheme = derivationSchemeMarker;
    existing.accountKeyPath = accountKeyPath;
    existing.masterFingerprint = masterFingerprint;
    existing.label = label;
    await this.walletsRepository.save(existing);
  }

  private buildPreviewRequest(dto: PreviewOnchainDto): OnchainPreviewRequest {
    const config: OnchainPreviewRequest['config'] = {
      derivationScheme: dto.derivationScheme,
      accountKeyPath: dto.accountKeyPath
    };

    return {
      amount: dto.amount,
      config
    };
  }

  private buildUpdatePayload(dto: UpdateOnchainDto): UpdateOnchainPaymentMethodPayload {
    return {
      enabled: dto.enabled ?? true,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: dto.accountKeyPath,
        label: dto.label,
        masterFingerprint: this.resolveFingerprint(dto)
      }
    };
  }

  private resolveFingerprint(
    dto: Pick<PreviewOnchainDto, 'masterFingerprint' | 'rootFingerprint'>
  ): string | undefined {
    const master = this.sanitizeString(dto.masterFingerprint);
    const root = this.sanitizeString(dto.rootFingerprint);

    if (master && root && master.toUpperCase() !== root.toUpperCase()) {
      throw new UnprocessableEntityException('Master and root fingerprint values must match.');
    }

    return root ?? master ?? undefined;
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

  private sanitizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRequestedAmount(amount: number | undefined): number {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return DEFAULT_PREVIEW_ADDRESS_COUNT;
    }
    const normalized = Math.max(1, Math.trunc(amount));
    return normalized;
  }
}
