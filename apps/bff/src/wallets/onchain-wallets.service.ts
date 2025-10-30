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

export interface OnchainWalletPresence {
  hasWallet: boolean;
  enabled: boolean;
  derivationScheme: string | null;
}

export interface OnchainWalletSettingsSummary {
  hasWallet: boolean;
  enabled: boolean;
  derivationScheme: string | null;
  accountKey: string | null;
  masterFingerprint: string | null;
  accountKeyPath: string | null;
  label: string | null;
}

const BTC_ONCHAIN_PAYMENT_METHOD_ID = BTC_ONCHAIN_PMID;

type WalletConfigFetchResult =
  | { kind: 'none' }
  | { kind: 'full'; config: OnchainPaymentMethodConfig }
  | { kind: 'limited'; summary: OnchainWalletSettingsSummary };

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
  ): Promise<OnchainWalletSettingsSummary> {
    const userId = this.requireUserId(userContext.id);
    const userEmail = this.requireUserEmail(userContext.email);
    const store = await this.requireStore(userId, storeId);

    try {
      const result = await this.fetchWalletConfigWithFallback(store, userEmail);

      if (result.kind === 'none') {
        return this.buildEmptySummary();
      }

      if (result.kind === 'limited') {
        return result.summary;
      }

      const metadata = await this.walletsRepository.findOne({
        where: [
          { storeId: store.id, paymentMethodId: BTC_ONCHAIN_PAYMENT_METHOD_ID },
          { storeId: store.id, paymentMethodId: 'BTC-OnChain' }
        ]
      });

      return this.composeSummary(result.config, metadata);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof ForbiddenException) {
        return this.buildLimitedSummaryFromMetadata(store);
      }
      if (error instanceof NotFoundException) {
        return this.buildEmptySummary();
      }
      if (isBTCPayAuthError(error)) {
        throw new UnauthorizedException('BTCPay authentication failed');
      }
      if (isBTCPayUpstreamError(error)) {
        if (error.status === 404) {
          return this.buildEmptySummary();
        }
        throw new BadGatewayException('Upstream error');
      }
      throw error;
    }
  }

  async getPresence(
    userContext: WalletUserContext,
    storeId: string
  ): Promise<OnchainWalletPresence> {
    const userId = this.requireUserId(userContext.id);
    const userEmail = this.requireUserEmail(userContext.email);
    const store = await this.requireStore(userId, storeId);

    try {
      const config = await this.keysService.withStoreSettingsWriteKey(
        store.btcpayStoreId,
        userEmail,
        async (apiKey) => {
          try {
            return await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
              includeConfig: true,
              apiKeyOverride: apiKey,
              store,
              host: store.btcpayHost
            });
          } catch (error) {
            if (error instanceof NotFoundException) {
              return null;
            }
            if (isBTCPayUpstreamError(error) && error.status === 404) {
              return null;
            }
            throw error;
          }
        },
        { host: store.btcpayHost }
      );

      if (!config || config.enabled !== true) {
        return { hasWallet: false, enabled: false, derivationScheme: null };
      }

      const derivationScheme = this.sanitizeString(config.config?.derivationScheme);

      return {
        hasWallet: Boolean(derivationScheme),
        enabled: true,
        derivationScheme: derivationScheme ?? null
      } satisfies OnchainWalletPresence;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof NotFoundException) {
        return { hasWallet: false, enabled: false, derivationScheme: null };
      }
      if (isBTCPayAuthError(error)) {
        throw new UnauthorizedException('BTCPay authentication failed');
      }
      if (isBTCPayUpstreamError(error)) {
        if (error.status === 404) {
          return { hasWallet: false, enabled: false, derivationScheme: null };
        }
        throw new BadGatewayException('Upstream error');
      }
      throw new BadGatewayException('Upstream error');
    }
  }

  private async fetchWalletConfigWithFallback(
    store: ManagedStoreEntity,
    userEmail: string
  ): Promise<WalletConfigFetchResult> {
    try {
      const config = await this.requestOnchainPaymentMethod(store, userEmail, true);
      if (!config) {
        return { kind: 'none' };
      }
      return { kind: 'full', config };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        (isBTCPayUpstreamError(error) && error.status === 403)
      ) {
        const minimal = await this.requestOnchainPaymentMethod(store, userEmail, false);
        if (!minimal) {
          return { kind: 'none' };
        }

        const limitedDerivation = this.sanitizeString(minimal.config?.derivationScheme);
        const metadata = await this.walletsRepository.findOne({
          where: [
            { storeId: store.id, paymentMethodId: BTC_ONCHAIN_PAYMENT_METHOD_ID },
            { storeId: store.id, paymentMethodId: 'BTC-OnChain' }
          ]
        });

        const metadataMarker = this.sanitizeString(metadata?.derivationScheme);
        const limitedHasWallet = Boolean(limitedDerivation || metadataMarker);

        return {
          kind: 'limited',
          summary: {
            hasWallet: limitedHasWallet,
            enabled: minimal.enabled === true,
            derivationScheme: limitedDerivation,
            accountKey: null,
            masterFingerprint: null,
            accountKeyPath: null,
            label: null
          }
        } satisfies WalletConfigFetchResult;
      }
      throw error;
    }
  }

  private async requestOnchainPaymentMethod(
    store: ManagedStoreEntity,
    userEmail: string,
    includeConfig: boolean
  ): Promise<OnchainPaymentMethodConfig | null> {
    const handler = async (apiKey: string) => {
      try {
        return await this.paymentMethods.getOnchain(store.btcpayStoreId, 'BTC', {
          store,
          apiKeyOverride: apiKey,
          includeConfig,
          host: store.btcpayHost
        });
      } catch (error) {
        if (error instanceof NotFoundException) {
          return null;
        }
        if (isBTCPayUpstreamError(error) && error.status === 404) {
          return null;
        }
        throw error;
      }
    };

    if (includeConfig) {
      return this.keysService.withStoreSettingsWriteKey(
        store.btcpayStoreId,
        userEmail,
        handler,
        { host: store.btcpayHost }
      );
    }

    return this.keysService.withStoreSettingsReadKey(
      store.btcpayStoreId,
      userEmail,
      handler,
      { host: store.btcpayHost }
    );
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
    const accountKeyPath = this.sanitizeString(dto.accountKeyPath);
    const label = this.sanitizeString(dto.label);
    return {
      enabled: dto.enabled ?? true,
      config: {
        derivationScheme: dto.derivationScheme,
        accountKeyPath: accountKeyPath ?? null,
        label: label ?? null,
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

  private buildEmptySummary(): OnchainWalletSettingsSummary {
    return {
      hasWallet: false,
      enabled: false,
      derivationScheme: null,
      accountKey: null,
      masterFingerprint: null,
      accountKeyPath: null,
      label: null
    } satisfies OnchainWalletSettingsSummary;
  }

  private async buildLimitedSummaryFromMetadata(
    store: ManagedStoreEntity
  ): Promise<OnchainWalletSettingsSummary> {
    const metadata = await this.walletsRepository.findOne({
      where: [
        { storeId: store.id, paymentMethodId: BTC_ONCHAIN_PAYMENT_METHOD_ID },
        { storeId: store.id, paymentMethodId: 'BTC-OnChain' }
      ]
    });

    const hasKnownWallet = Boolean(this.sanitizeString(metadata?.derivationScheme));

    if (!hasKnownWallet) {
      return this.buildEmptySummary();
    }

    return {
      hasWallet: hasKnownWallet,
      enabled: false,
      derivationScheme: null,
      accountKey: null,
      masterFingerprint: null,
      accountKeyPath: null,
      label: null
    } satisfies OnchainWalletSettingsSummary;
  }

  private composeSummary(
    config: {
      enabled: boolean;
      config: {
        derivationScheme: string | null;
        accountKeyPath: string | null;
        masterFingerprint: string | null;
        label: string | null;
      };
    },
    metadata: ManagedStoreWalletEntity | null
  ): OnchainWalletSettingsSummary {
    const derivationScheme = this.sanitizeString(config.config?.derivationScheme);
    const derivationDetails = this.extractDerivationDetails(derivationScheme);
    const accountKeyPath =
      this.sanitizeString(config.config?.accountKeyPath) ||
      metadata?.accountKeyPath ||
      derivationDetails.accountKeyPath ||
      null;
    const label = this.sanitizeString(config.config?.label) || metadata?.label || null;

    const masterFingerprint =
      derivationDetails.masterFingerprint ||
      (this.sanitizeString(config.config?.masterFingerprint)?.toUpperCase() ?? null) ||
      metadata?.masterFingerprint ||
      null;

    const accountKey = derivationDetails.accountKey;

    const hasStoredDerivation = Boolean(derivationScheme);
    const hasMetadataMarker = Boolean(this.sanitizeString(metadata?.derivationScheme));

    return {
      hasWallet: hasStoredDerivation || hasMetadataMarker,
      enabled: config.enabled === true,
      derivationScheme,
      accountKey,
      masterFingerprint,
      accountKeyPath,
      label
    } satisfies OnchainWalletSettingsSummary;
  }

  private buildPresenceFromConfig(
    config: OnchainPaymentMethodConfig | null
  ): OnchainWalletPresence {
    if (!config) {
      return { hasWallet: false, enabled: false, derivationScheme: null };
    }

    const derivationScheme = this.sanitizeString(config.config?.derivationScheme);

    return {
      hasWallet: Boolean(derivationScheme),
      enabled: config.enabled === true,
      derivationScheme: derivationScheme ?? null
    } satisfies OnchainWalletPresence;
  }

  private buildPresenceFromSummary(
    summary: OnchainWalletSettingsSummary
  ): OnchainWalletPresence {
    const derivationScheme = this.sanitizeString(summary.derivationScheme);

    return {
      hasWallet: summary.hasWallet === true,
      enabled: summary.enabled === true,
      derivationScheme: derivationScheme ?? null
    } satisfies OnchainWalletPresence;
  }

  private extractDerivationDetails(
    derivationScheme: string | null
  ): { accountKey: string | null; masterFingerprint: string | null; accountKeyPath: string | null } {
    if (!derivationScheme) {
      return { accountKey: null, masterFingerprint: null, accountKeyPath: null };
    }

    const descriptor = derivationScheme.trim();
    if (!descriptor.includes('[') || !descriptor.includes(']')) {
      return { accountKey: null, masterFingerprint: null, accountKeyPath: null };
    }

    const start = descriptor.indexOf('[');
    const end = descriptor.indexOf(']', start + 1);
    if (start === -1 || end === -1 || end <= start + 1) {
      return { accountKey: null, masterFingerprint: null, accountKeyPath: null };
    }

    const origin = descriptor.slice(start + 1, end).trim();
    const [fingerprintRaw, ...pathParts] = origin.split('/').map((part) => part.trim()).filter(Boolean);
    const masterFingerprint = this.normalizeFingerprint(fingerprintRaw);

    const remainder = descriptor.slice(end + 1).trim();
    const slashIndex = remainder.indexOf('/');
    const candidateKey = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
    const accountKey = this.normalizeExtendedPublicKey(candidateKey);

    const accountKeyPath = pathParts.length > 0 ? `m/${pathParts.join('/')}` : null;

    return { accountKey, masterFingerprint, accountKeyPath };
  }

  private normalizeFingerprint(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    if (!/^[0-9a-fA-F]{8}$/.test(normalized)) {
      return null;
    }
    return normalized.toUpperCase();
  }

  private normalizeExtendedPublicKey(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const keyPattern = /^(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{10,}$/;
    if (!keyPattern.test(normalized)) {
      return null;
    }
    return normalized;
  }
}
