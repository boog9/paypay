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

export interface OnchainWalletSummaryReadModel {
  storeId: string;
  paymentMethodId: string;
  enabled: boolean;
  currency: string;
  previewAddresses: string[];
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
    const userEmail = this.requireUserEmail(userContext.email);
    const store = await this.requireStore(userId, storeId);
    const handler = async (apiKey: string) =>
      this.paymentMethods.previewOnchainPaymentMethod(
        store.btcpayStoreId,
        'BTC',
        {
          derivationScheme: dto.derivationScheme,
          accountKeyPath: dto.accountKeyPath ?? null
        },
        { store, apiKeyOverride: apiKey }
      );

    const requestPreview = (mode: 'read' | 'write') =>
      mode === 'write'
        ? this.keysService.withStoreSettingsWriteKey(store.btcpayStoreId, userEmail, handler, {
            host: store.btcpayHost
          })
        : this.keysService.withStoreSettingsReadKey(store.btcpayStoreId, userEmail, handler, {
            host: store.btcpayHost
          });

    let preview: OnchainPreviewResponse;
    try {
      preview = await requestPreview('read');
    } catch (error) {
      if (error instanceof ForbiddenException) {
        preview = await requestPreview('write');
      } else {
        throw error;
      }
    }
    const requestedAmount = this.normalizeRequestedAmount(dto.amount);
    return {
      ...preview,
      paymentMethodId: canonicalPaymentMethodId(preview.paymentMethodId, 'chain') || preview.paymentMethodId,
      addresses: this.normalizePreviewAddresses(preview.addresses, requestedAmount)
    };
  }

  async getSummary(
    userContext: WalletUserContext,
    storeId: string
  ): Promise<OnchainWalletSummaryReadModel> {
    const userId = this.requireUserId(userContext.id);
    const store = await this.requireStore(userId, storeId);

    try {
      const summary = await this.paymentMethods.getOnchainWalletSummary(
        store.btcpayStoreId,
        store.btcpayHost,
        { store }
      );

      if (!summary.enabled) {
        throw new NotFoundException('On-chain BTC payment method is not enabled for this store.');
      }

      const normalizedCurrency =
        typeof summary.currency === 'string' && summary.currency.trim()
          ? summary.currency.trim().toUpperCase()
          : 'BTC';
      const previewAddresses = Array.isArray(summary.previewAddresses)
        ? summary.previewAddresses.slice(0, DEFAULT_PREVIEW_ADDRESS_COUNT)
        : [];

      return {
        storeId: summary.storeId,
        paymentMethodId: canonicalPaymentMethodId(summary.paymentMethodId, 'chain') || summary.paymentMethodId,
        enabled: true,
        currency: normalizedCurrency,
        previewAddresses
      } satisfies OnchainWalletSummaryReadModel;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (isBTCPayAuthError(error)) {
        throw new UnauthorizedException('BTCPay authentication failed');
      }
      if (isBTCPayUpstreamError(error)) {
        if (error.status === 404) {
          throw new NotFoundException('On-chain BTC payment method is not enabled for this store.');
        }
        if (error.status === 403) {
          throw new ForbiddenException('BTCPay returned limited permissions.');
        }
        throw new BadGatewayException('Upstream error');
      }
      throw error;
    }
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
    const sanitized = this.sanitizeString(email);
    if (!sanitized) {
      throw new UnauthorizedException('User email is required');
    }

    const normalized = normalizeEmail(sanitized);
    if (!normalized) {
      throw new UnauthorizedException('User email is invalid');
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
    if (limited.length === 0) {
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
