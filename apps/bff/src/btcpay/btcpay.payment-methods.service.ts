import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { BtcpayService } from './btcpay.service';
import { BTCPayAuthError, BTCPayUpstreamError } from './btcpay.errors';
import { isUuid } from '../shared/is-uuid';
import { BtcpayValidationException } from '../http/btcpay-validation.exception';

type Maybe<T> = T | null | undefined;

const INVALID_DERIVATION_MESSAGE =
  "Enter xpub/ypub/zpub/tpub/upub/vpub or a descriptor (e.g., wpkh([FPR/84'/1'/0']tpub.../0/*)). Account key path is optional.";

export const DEFAULT_PREVIEW_ADDRESS_COUNT = 10;

const BTC_CHAIN_PMID = 'BTC-CHAIN';
const PM_ONCHAIN = BTC_CHAIN_PMID;

export const BTC_CHAIN = PM_ONCHAIN;

export function mask(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 16) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-8)}`;
}

export interface OnchainPreviewDescriptorDto {
  derivationScheme: string;
  accountKeyPath: string;
}

export interface OnchainConfigDto {
  tpub: string;
  rootFingerprint: string;
  accountKeyPath: string;
}

export interface OnchainPreviewConfig {
  derivationScheme?: string;
  accountKeyPath?: string | null;
}

export interface OnchainPreviewRequest {
  offset?: number;
  amount?: number;
  config?: OnchainPreviewConfig | null;
}

export interface OnchainPreviewAddressItem {
  address: string;
}

export interface OnchainPreviewResponse {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  addresses: OnchainPreviewAddressItem[];
}

export interface OnchainPaymentMethodConfig {
  storeId: string;
  paymentMethodId: 'BTC-CHAIN';
  enabled: boolean;
  config: {
    derivationScheme: string | null;
    accountKey: string | null;
    accountKeyPath: string | null;
    masterFingerprint: string | null;
    label: string | null;
  };
}

export interface OnchainConfigResponse {
  enabled: boolean;
  config?: {
    derivationScheme: string | null;
    accountKey?: string | null;
    accountKeyPath?: string | null;
    masterFingerprint?: string | null;
    label?: string | null;
  };
}

export interface OnchainPaymentMethodStatus {
  storeId: string;
  paymentMethodId: string;
  enabled: boolean;
}

export interface SafeOnChainWalletSettings {
  enabled: boolean;
  label: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
}

export interface OnchainWalletSummary {
  storeId: string;
  paymentMethodId: string;
  enabled: boolean;
  currency: string;
  previewAddresses?: string[];
}

export interface UpdateOnchainPaymentMethodPayload {
  enabled?: boolean;
  config: {
    derivationScheme: string;
    accountKeyPath?: string | null;
  };
}

export type BtcpayPaymentMethodType = 'chain' | 'ln' | 'lnurl';

const PAYMENT_METHOD_SUFFIX: Record<BtcpayPaymentMethodType, string> = {
  chain: 'CHAIN',
  ln: 'LIGHTNINGNETWORK',
  lnurl: 'LIGHTNINGLIKELNURLPAY'
};

const PAYMENT_METHOD_ALIASES: Record<BtcpayPaymentMethodType, string[]> = {
  chain: ['CHAIN', 'ONCHAIN'],
  ln: ['LIGHTNINGNETWORK'],
  lnurl: ['LIGHTNINGLIKELNURLPAY']
};

export function normalizePaymentMethodId(cryptoCode: string, type: BtcpayPaymentMethodType): string {
  const code = typeof cryptoCode === 'string' ? cryptoCode.trim().toUpperCase() : '';
  if (!code) {
    throw new InternalServerErrorException('Invalid payment method crypto code.');
  }

  const suffix = PAYMENT_METHOD_SUFFIX[type];
  if (!suffix) {
    throw new InternalServerErrorException('Unsupported payment method type.');
  }

  return `${code}-${suffix}`;
}

export function canonicalPaymentMethodId(paymentMethodId: string, type: BtcpayPaymentMethodType = 'chain'): string {
  if (typeof paymentMethodId !== 'string') {
    return '';
  }

  const trimmed = paymentMethodId.trim();
  if (!trimmed) {
    return '';
  }

  const upper = trimmed.toUpperCase();
  const aliases = PAYMENT_METHOD_ALIASES[type] ?? [];
  for (const alias of aliases) {
    if (upper.endsWith(`-${alias}`)) {
      return `${upper.slice(0, -alias.length)}${PAYMENT_METHOD_SUFFIX[type]}`;
    }
  }

  return upper;
}

interface PaymentMethodRequestOptions {
  store?: ManagedStoreEntity;
  apiKeyOverride?: string | null;
  host?: string | null;
}

interface PreviewOnchainAddressesOptions {
  host?: string;
  apiKey?: string;
  store?: ManagedStoreEntity;
}

export interface UpdateOnchainPaymentMethodRequest {
  storeId: string;
  derivationScheme: string;
  accountKeyPath?: string | null;
  masterFingerprint?: string | null;
  label?: string | null;
  enabled?: boolean;
  allowAccountKeyPath?: boolean;
}

export interface UpdateOnchainPaymentMethodOptions extends PaymentMethodRequestOptions {
  apiKey?: string | null;
}

interface StoreContext {
  store: ManagedStoreEntity;
  apiKey: string;
  baseUrl: string;
  http: AxiosInstance;
  cleanup: () => void;
}

interface PreviewAddressLike {
  address?: unknown;
  keyPath?: unknown;
  index?: unknown;
}

interface PaymentMethodRecord {
  enabled?: unknown;
  paymentMethodId?: unknown;
  config?: unknown;
  derivationScheme?: unknown;
  accountKeyPath?: unknown;
  label?: unknown;
}

interface WalletGenerateRequestDto {
  derivationScheme: string;
  accountKeyPath?: string;
  masterFingerprint?: string;
  label?: string | null;
}

interface PaymentMethodCollectionQueryParams {
  paymentMethodId?: string;
  onlyEnabled?: boolean;
  includeConfig?: boolean;
}

@Injectable()
export class BtcpayPaymentMethodsService {
  private readonly logger = new Logger(BtcpayPaymentMethodsService.name, { timestamp: false });

  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly btcpayService: BtcpayService
  ) {}

  // BTCPay Greenfield API v1 (BTCPay Server ≥ 2.x) exposes previewing via
  // GET /stores/{storeId}/payment-methods/{paymentMethodId}/wallet/preview.
  // See https://docs.btcpayserver.org/API/Greenfield/v1/#tag/Store-Payment-Methods/operation/Stores_PaymentMethods_PreviewWallet
  // for the canonical schema.
  async previewOnchain(
    storeId: string,
    currencyCode = 'BTC',
    body?: OnchainPreviewRequest,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPreviewResponse> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = currencyCode.toUpperCase();
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');
    const previewConfig = this.normalizePreviewConfig(body?.config);
    const params = this.buildPreviewQueryParams(body);
    const requestBody = this.buildPreviewRequestBody(previewConfig);
    const modernPath = this.buildOnchainPreviewPath(context.store.btcpayStoreId, paymentMethodId);
    try {
      this.logger.debug(
        `Previewing on-chain wallet for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
      );
      const response = requestBody
        ? await context.http.post(modernPath, requestBody, {
            params: Object.keys(params).length > 0 ? params : undefined
          })
        : await context.http.get(modernPath, {
            params: Object.keys(params).length > 0 ? params : undefined
          });
      return this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (error) {
      throw this.mapPreviewError(error, {
        storeId: context.store.id,
        paymentMethodId
      });
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to preview on-chain payment method.');
  }

  async previewWithDescriptor(
    storeId: string,
    dto: OnchainPreviewDescriptorDto,
    options?: PaymentMethodRequestOptions
  ): Promise<{ addresses: Array<{ address: string }> }> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = BTC_CHAIN_PMID;
    const accountKeyPath = this.normalizeDescriptorAccountPath(dto.accountKeyPath);
    const params = {
      ...this.buildPreviewQueryParams(),
      derivationScheme: dto.derivationScheme,
      accountKeyPath
    };

    try {
      const response = await context.http.get(
        this.buildOnchainPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        { params }
      );
      const addresses = this.extractPreviewAddresses(response.data).map((item) => ({
        address: item.address
      }));
      return { addresses };
    } catch (error) {
      throw this.mapPreviewAddressesError(error, {
        storeId: context.store.id,
        paymentMethodId,
        mode: 'descriptor'
      });
    } finally {
      context.cleanup();
    }
  }

  async previewWithTpub(
    storeId: string,
    dto: OnchainConfigDto,
    options?: PaymentMethodRequestOptions
  ): Promise<{ addresses: Array<{ address: string }> }> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = BTC_CHAIN_PMID;
    const body = {
      config: this.buildOnchainConfigBody(dto)
    };
    const params = this.buildPreviewQueryParams();

    try {
      const response = await context.http.post(
        this.buildOnchainPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        body,
        { params }
      );
      const addresses = this.extractPreviewAddresses(response.data).map((item) => ({
        address: item.address
      }));
      return { addresses };
    } catch (error) {
      throw this.mapPreviewAddressesError(error, {
        storeId: context.store.id,
        paymentMethodId,
        mode: 'tpub'
      });
    } finally {
      context.cleanup();
    }
  }

  async saveOnchain(
    storeId: string,
    dto: OnchainConfigDto | null,
    options?: PaymentMethodRequestOptions & { enabled?: boolean }
  ): Promise<unknown> {
    const { enabled, ...requestOptions } = options ?? {};
    const context = await this.prepareStoreContext(storeId, requestOptions);
    const paymentMethodId = BTC_CHAIN_PMID;
    const body = enabled === false
      ? { enabled: false }
      : { enabled: true, config: this.buildOnchainConfigBody(dto!) };

    try {
      const response = await context.http.put(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        body
      );
      return response.data;
    } catch (error) {
      throw this.mapSaveOnchainError(error, {
        storeId: context.store.id,
        paymentMethodId
      });
    } finally {
      context.cleanup();
    }
  }

  async previewOnchainAddresses(
    storeId: string,
    input: {
      derivationScheme: string;
      accountKeyPath?: string | null;
    },
    options?: PreviewOnchainAddressesOptions
  ): Promise<{ addresses: Array<{ address: string }> }> {
    const preferredStore = options?.store;
    const context = await this.prepareStoreContext(preferredStore?.id ?? storeId, {
      store: preferredStore,
      host: options?.host ?? null,
      apiKeyOverride: options?.apiKey ?? null
    });
    const url = this.buildOnchainPreviewPath(context.store.btcpayStoreId, BTC_CHAIN_PMID);
    const params = this.buildPreviewQueryParams();
    const requestBody = {
      derivationScheme: input.derivationScheme,
      accountKeyPath: input.accountKeyPath ?? null
    };
    const logContext = {
      storeId: context.store.id,
      paymentMethodId: BTC_CHAIN_PMID
    };

    try {
      const response = await context.http.post<unknown>(url, requestBody, { params });
      this.logger.debug(
        { ...logContext, status: response.status ?? 0 },
        'btcpayPreview'
      );
      const addresses = this.extractPreviewAddresses(response.data).map((item) => ({ address: item.address }));
      return { addresses };
    } catch (error) {
      throw this.mapPreviewAddressesError(error, logContext);
    } finally {
      context.cleanup();
    }
  }

  async generateOnchainWallet(
    store: ManagedStoreEntity,
    payload: {
      derivationScheme: string;
      accountKeyPath?: string | null;
      masterFingerprint?: string | null;
      label?: string | null;
    },
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(store.id, { ...options, store });
    const url = this.buildOnchainGeneratePath(context.store.btcpayStoreId, PM_ONCHAIN);
    const body = this.buildWalletGenerateRequestBody({
      derivationScheme: payload.derivationScheme,
      accountKeyPath: payload.accountKeyPath ?? undefined,
      masterFingerprint: payload.masterFingerprint ?? undefined,
      label: payload.label ?? undefined
    });

    try {
      const response = await context.http.post<unknown>(url, body);
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        'BTC',
        PM_ONCHAIN
      );
    } catch (error) {
      throw this.mapGenerateWalletError(error);
    } finally {
      context.cleanup();
    }
  }

  // BTCPay Greenfield API v1 surfaces configuration at /payment-methods/{paymentMethodId}.
  // Refer to the Swagger UI on the target instance (/docs) for the canonical schema.
  async getOnchain(
    storeId: string,
    currencyCode = 'BTC',
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = currencyCode.toUpperCase();
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');

    try {
      const response = await context.http.get<unknown>(
        this.buildModernPaymentMethodsCollectionPath(context.store.btcpayStoreId),
        {
          params: {
            paymentMethodId,
            includeConfig: true,
            onlyEnabled: false
          }
        }
      );
      const raw = response.data;
      const match = this.extractPaymentMethodStatus(raw, paymentMethodId);
      if (!match) {
        return this.normalizePaymentMethodResponse(
          {
            enabled: false,
            paymentMethodId,
            config: {}
          },
          context.store.btcpayStoreId,
          currency,
          paymentMethodId
        );
      }
      return this.normalizePaymentMethodResponse(
        match,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }
  }

  async getOnchainWalletSettings(
    storeId: string,
    cryptoCode = 'BTC',
    options?: PaymentMethodRequestOptions
  ): Promise<SafeOnChainWalletSettings> {
    const baseConfig = await this.getOnchainConfig(storeId, false, options);

    if (!baseConfig.enabled) {
      throw new NotFoundException('On-chain BTC payment method not found');
    }

    let label: string | null = null;
    let accountKeyPath: string | null = null;
    let masterFingerprint: string | null = null;

    try {
      const detailed = await this.getOnchain(storeId, cryptoCode, options);
      const metadata = this.extractConfigMetadata(detailed.config ?? {});

      label = metadata.label ?? null;
      accountKeyPath = metadata.accountKeyPath ?? null;
      masterFingerprint = metadata.masterFingerprint ? metadata.masterFingerprint.toUpperCase() : null;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException
      ) {
        // Best-effort: fallback to enabled status without additional metadata.
      } else if (error instanceof NotFoundException) {
        throw error;
      } else {
        // Any other unexpected error should be surfaced as upstream failure without leaking details.
        throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }
    }

    return {
      enabled: true,
      label,
      accountKeyPath,
      masterFingerprint
    } satisfies SafeOnChainWalletSettings;
  }

  async getOnchainConfig(
    storeId: string,
    includeConfig = true,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainConfigResponse> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = normalizePaymentMethodId('BTC', 'chain');

    try {
      const response = await context.http.get(
        this.buildModernPaymentMethodsCollectionPath(context.store.btcpayStoreId),
        {
          params: {
            paymentMethodId,
            includeConfig: includeConfig ? true : false,
            onlyEnabled: false
          }
        }
      );

      const payload = this.extractPaymentMethodStatus(response.data, paymentMethodId) ??
        (response.data as Record<string, unknown>);
      const enabled = payload?.enabled === true;

      if (!enabled || !includeConfig) {
        return { enabled } satisfies OnchainConfigResponse;
      }

      const configPayload = (payload?.config ?? {}) as Record<string, unknown>;

      const metadata = this.extractConfigMetadata(configPayload);

      return {
        enabled: true,
        config: {
          derivationScheme: metadata.derivationScheme,
          accountKey: metadata.accountKey,
          accountKeyPath: metadata.accountKeyPath,
          masterFingerprint: metadata.masterFingerprint,
          label: metadata.label
        }
      } satisfies OnchainConfigResponse;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 0;
        if (status === 404) {
          return { enabled: false } satisfies OnchainConfigResponse;
        }
        if (status === 401) {
          throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
        }
        if (status === 403) {
          throw new ForbiddenException('BTCPay returned limited permissions', { cause: error as Error });
        }
        if (status === 422) {
          const message = this.extractErrorMessage(error) || INVALID_DERIVATION_MESSAGE;
          throw new UnprocessableEntityException(message, { cause: error as Error });
        }
        if (status >= 500) {
          throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
        }
        if (status >= 400) {
          const message = this.extractErrorMessage(error);
          throw new UnprocessableEntityException(message, { cause: error as Error });
        }
      }

      throw new BadGatewayException('BTCPay request failed', {
        cause: error instanceof Error ? error : undefined
      });
    } finally {
      context.cleanup();
    }
  }

  async getOnchainMethodStatus(
    storeId: string,
    paymentMethodId = BTC_CHAIN,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodStatus> {
    const context = await this.prepareStoreContext(storeId, options);
    const normalizedId = canonicalPaymentMethodId(
      typeof paymentMethodId === 'string' ? paymentMethodId : '',
      'chain'
    ) || normalizePaymentMethodId('BTC', 'chain');
    const storeIdentifier = context.store.btcpayStoreId;

    try {
      const response = await context.http.get(
        this.buildModernPaymentMethodsCollectionPath(storeIdentifier),
        {
          params: {
            paymentMethodId: normalizedId,
            onlyEnabled: false,
            includeConfig: false
          } satisfies PaymentMethodCollectionQueryParams
        }
      );
      const match = this.extractPaymentMethodStatus(response.data, normalizedId);
      if (!match) {
        return { storeId: storeIdentifier, paymentMethodId: normalizedId, enabled: false };
      }
      const resolvedId = canonicalPaymentMethodId(
        typeof match.paymentMethodId === 'string' ? match.paymentMethodId : '',
        'chain'
      ) || normalizedId;
      const enabled = typeof match.enabled === 'boolean' ? match.enabled : false;
      return { storeId: storeIdentifier, paymentMethodId: resolvedId, enabled };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          return { storeId: storeIdentifier, paymentMethodId: normalizedId, enabled: false };
        }
        if (status === 401 || status === 403) {
          throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
        }
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    return { storeId: storeIdentifier, paymentMethodId: normalizedId, enabled: false };
  }

  async getOnchainWalletSummary(
    storeId: string,
    host?: string,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainWalletSummary> {
    const context = await this.prepareStoreContext(storeId, { ...options, host });
    const currency = 'BTC';
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');

    try {
      const response = await context.http.get(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId)
      );
      const normalized = this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
      const previewFromPayload = this.extractPreviewAddresses(response.data)
        .map((item) => item.address)
        .filter((value) => typeof value === 'string' && value.trim());
      const previewAddresses = await this.resolvePreviewAddresses(
        context,
        paymentMethodId,
        previewFromPayload
      );

      return {
        storeId: normalized.storeId,
        paymentMethodId: normalized.paymentMethodId,
        enabled: normalized.enabled,
        currency: 'BTC',
        previewAddresses: previewAddresses.length > 0 ? previewAddresses : undefined
      } satisfies OnchainWalletSummary;
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to retrieve on-chain wallet summary.');
  }

  async getOnchainWalletConfigInternal(
    storeId: string,
    host?: string,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const apiKey = this.normalizeApiKey(options?.apiKeyOverride);
    if (!apiKey) {
      throw new ForbiddenException('Elevated BTCPay permissions are required for configuration access.');
    }

    const context = await this.prepareStoreContext(storeId, {
      ...options,
      apiKeyOverride: apiKey,
      host
    });
    const currency = 'BTC';
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');

    try {
      const response = await context.http.get(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId)
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to retrieve on-chain wallet configuration.');
  }

  // BTCPay Greenfield API v1 applies updates via PUT /payment-methods/{paymentMethodId}.
  // Refer to the Swagger UI on the target instance (/docs) for the canonical schema.
  async updateOnchain(
    storeId: string,
    currencyCode = 'BTC',
    payload: UpdateOnchainPaymentMethodPayload,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = currencyCode.toUpperCase();
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');
    const requestBody = this.buildUpdateRequestBody(payload);

    try {
      const response = await context.http.put(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        requestBody
      );
      return this.normalizePaymentMethodResponse(response.data, context.store.btcpayStoreId, currency, paymentMethodId);
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to update on-chain payment method.');
  }

  async updateOnchainPaymentMethod(
    params: UpdateOnchainPaymentMethodRequest,
    options?: UpdateOnchainPaymentMethodOptions
  ): Promise<void> {
    const context = await this.prepareStoreContext(params.storeId, {
      store: options?.store,
      apiKeyOverride: options?.apiKey ?? null
    });
    const paymentMethodId = BTC_CHAIN;
    const derivation = typeof params.derivationScheme === 'string' ? params.derivationScheme.trim() : '';
    if (!derivation) {
      context.cleanup();
      throw new InternalServerErrorException('Derivation scheme is required to update wallet configuration.');
    }

    let includeAccountKeySettings = this.isExtendedPublicKey(derivation);
    const buildBody = (includeSettings: boolean) =>
      this.buildUpdateRequestBody(
        {
          enabled: params.enabled ?? true,
          config: { derivationScheme: derivation, accountKeyPath: params.accountKeyPath }
        },
        {
          includeAccountKeySettings: includeSettings,
          accountKeyPath: params.accountKeyPath ?? null,
          allowAccountKeyPath: params.allowAccountKeyPath === true
        }
      );

    const primaryBody = buildBody(includeAccountKeySettings);
    const targetPath = this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId);

    try {
      await context.http.put(targetPath, primaryBody);
    } catch (error) {
      if (this.shouldRetryWithAccountKeySettings(error) && includeAccountKeySettings === false) {
        const retryBody = buildBody(true);
        includeAccountKeySettings = true;
        try {
          await context.http.put(targetPath, retryBody);
          return;
        } catch (retryError) {
          this.handleUpdatePaymentMethodError(retryError);
        }
      }
      this.handleUpdatePaymentMethodError(error);
    } finally {
      context.cleanup();
    }
  }

  private buildPreviewQueryParams(body?: OnchainPreviewRequest): Record<string, string> {
    const offset = Number.isFinite(body?.offset) ? Math.max(0, Math.trunc(body?.offset ?? 0)) : 0;
    const amount =
      Number.isFinite(body?.amount) && (body?.amount ?? 0) > 0
        ? Math.max(1, Math.trunc(body?.amount ?? DEFAULT_PREVIEW_ADDRESS_COUNT))
        : DEFAULT_PREVIEW_ADDRESS_COUNT;

    return {
      offset: String(offset),
      count: String(amount)
    };
  }

  private normalizeDescriptorAccountPath(path: string): string {
    const trimmed = typeof path === 'string' ? path.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Account key path is required for descriptor preview.');
    }

    if (trimmed.startsWith('m/')) {
      return trimmed;
    }

    return `m/${trimmed}`;
  }

  private buildOnchainConfigBody(dto: OnchainConfigDto) {
    const accountDerivation = this.normalizeExtendedKey(dto.tpub);
    const rootFingerprint = this.normalizeRootFingerprint(dto.rootFingerprint);
    const accountKeyPath = this.normalizeConfigAccountPath(dto.accountKeyPath);

    return {
      accountDerivation,
      accountOriginal: accountDerivation,
      isHotWallet: false,
      accountKeySettings: [
        {
          rootFingerprint,
          accountKeyPath,
          accountKey: accountDerivation
        }
      ]
    };
  }

  private normalizeExtendedKey(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Extended public key is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Extended public key must not be empty.');
    }
    return trimmed;
  }

  private normalizeRootFingerprint(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Root fingerprint is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Root fingerprint must not be empty.');
    }
    if (!/^[0-9a-fA-F]{8}$/.test(trimmed)) {
      throw new BadRequestException('Root fingerprint must be 8 hexadecimal characters.');
    }
    return trimmed.toUpperCase();
  }

  private normalizeConfigAccountPath(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Account key path is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Account key path must not be empty.');
    }
    const withoutPrefix = trimmed.startsWith('m/') ? trimmed.slice(2) : trimmed;
    if (!withoutPrefix) {
      throw new BadRequestException('Account key path must not be empty.');
    }
    return withoutPrefix;
  }

  private buildPreviewRequestBody(
    config: { derivationScheme?: string; accountKeyPath?: string | null } | undefined
  ): { derivationScheme: string; accountKeyPath: string | null } | null {
    if (!config?.derivationScheme) {
      return null;
    }

    const accountKeyPath =
      config.accountKeyPath === undefined || config.accountKeyPath === null
        ? null
        : config.accountKeyPath;

    return {
      derivationScheme: config.derivationScheme,
      accountKeyPath
    };
  }

  private buildWalletGenerateRequestBody(
    dto: {
      derivationScheme?: string | null;
      accountKeyPath?: string | null;
      masterFingerprint?: string | null;
      label?: string | null;
    }
  ): WalletGenerateRequestDto {
    const payload: WalletGenerateRequestDto = { derivationScheme: '' };

    if (typeof dto.derivationScheme === 'string') {
      const trimmed = dto.derivationScheme.trim();
      if (trimmed) {
        payload.derivationScheme = trimmed;
      }
    }

    if (!payload.derivationScheme) {
      throw new InternalServerErrorException('Derivation scheme is required to generate wallet.');
    }

    if (typeof dto.accountKeyPath === 'string') {
      const trimmed = dto.accountKeyPath.trim();
      if (trimmed) {
        payload.accountKeyPath = trimmed;
      }
    }

    if (typeof dto.masterFingerprint === 'string') {
      const trimmed = dto.masterFingerprint.trim();
      if (trimmed) {
        payload.masterFingerprint = trimmed.toUpperCase();
      }
    }

    if (typeof dto.label === 'string') {
      const trimmed = dto.label.trim();
      if (trimmed) {
        payload.label = trimmed;
      }
    }

    return payload;
  }

  private buildUpdateRequestBody(
    payload: UpdateOnchainPaymentMethodPayload,
    options?: {
      includeAccountKeySettings?: boolean;
      accountKeyPath?: string | null;
      allowAccountKeyPath?: boolean;
    }
  ): Record<string, unknown> {
    const config = this.buildUpdateConfigPayload(payload.config, options);
    const body: Record<string, unknown> = { config };
    if (payload.enabled !== undefined) {
      body.enabled = payload.enabled;
    }
    return body;
  }

  private normalizePreviewConfig(
    config: OnchainPreviewConfig | null | undefined
  ): {
    derivationScheme?: string;
    accountKeyPath?: string | null;
  } {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const payload: {
      derivationScheme?: string;
      accountKeyPath?: string | null;
    } = {};

    if (typeof config.derivationScheme === 'string' && config.derivationScheme.trim()) {
      payload.derivationScheme = config.derivationScheme.trim();
    }

    if (config.accountKeyPath !== undefined) {
      if (config.accountKeyPath === null) {
        payload.accountKeyPath = null;
      } else if (typeof config.accountKeyPath === 'string' && config.accountKeyPath.trim()) {
        payload.accountKeyPath = config.accountKeyPath.trim();
      }
    }

    return payload;
  }

  private buildUpdateConfigPayload(
    config: UpdateOnchainPaymentMethodPayload['config'],
    options?: {
      includeAccountKeySettings?: boolean;
      accountKeyPath?: string | null;
      allowAccountKeyPath?: boolean;
    }
  ): Record<string, unknown> {
    const derivation = typeof config.derivationScheme === 'string' ? config.derivationScheme.trim() : '';
    if (!derivation) {
      throw new InternalServerErrorException('Derivation scheme is required to update wallet configuration.');
    }

    const payload: Record<string, unknown> = {
      accountDerivation: derivation,
      isHotWallet: false
    };

    if (options?.includeAccountKeySettings !== false) {
      const accountKeySettingsEntry: Record<string, unknown> = {
        accountKey: derivation
      };

      if (options?.allowAccountKeyPath && typeof options.accountKeyPath === 'string') {
        const trimmed = options.accountKeyPath.trim();
        if (trimmed) {
          accountKeySettingsEntry.accountKeyPath = trimmed;
        }
      }

      payload.accountKeySettings = [accountKeySettingsEntry];
    }

    return payload;
  }

  private normalizePreviewResponse(
    source: unknown,
    storeId: string,
    fallbackCurrency: string,
    paymentMethodId: string
  ): OnchainPreviewResponse {
    const addresses = this.extractPreviewAddresses(source);
    const currency = this.extractCurrencyMetadata(source, fallbackCurrency);
    const normalizedPaymentMethodId = canonicalPaymentMethodId(paymentMethodId, 'chain') || paymentMethodId;

    return {
      storeId,
      currency,
      paymentMethodId: normalizedPaymentMethodId,
      addresses
    } satisfies OnchainPreviewResponse;
  }

  private normalizePaymentMethodResponse(
    payload: unknown,
    storeId: string,
    _fallbackCurrency: string,
    fallbackPaymentMethodId: string
  ): OnchainPaymentMethodConfig {
    if (!payload) {
      throw new InternalServerErrorException('BTCPay returned an empty response.');
    }

    let enabled = false;
    let paymentMethodId = fallbackPaymentMethodId;
    let configPayload: unknown = payload;
    let label: string | null = null;

    if (typeof payload === 'object' && payload !== null) {
      const record = payload as PaymentMethodRecord;
      if (typeof record.enabled === 'boolean') {
        enabled = record.enabled;
      }
      if (typeof record.paymentMethodId === 'string' && record.paymentMethodId.trim()) {
        paymentMethodId = record.paymentMethodId.trim();
      }
      if (record.config !== undefined) {
        configPayload = record.config;
      }
      if (typeof record.label === 'string' && record.label.trim()) {
        label = record.label.trim();
      }
      if (typeof record.derivationScheme === 'string') {
        configPayload = {
          ...(typeof configPayload === 'object' && configPayload !== null ? (configPayload as Record<string, unknown>) : {}),
          derivationScheme: record.derivationScheme
        };
      }
      if (typeof record.accountKeyPath === 'string') {
        configPayload = {
          ...(typeof configPayload === 'object' && configPayload !== null ? (configPayload as Record<string, unknown>) : {}),
          accountKeyPath: record.accountKeyPath
        };
      }
    }

    if (typeof payload === 'string') {
      configPayload = { derivationScheme: payload };
    }

    const { derivationScheme, accountKey, accountKeyPath, masterFingerprint, label: derivedLabel } =
      this.extractConfigMetadata(configPayload);

    const resolvedPaymentMethodId = (canonicalPaymentMethodId(paymentMethodId, 'chain') || paymentMethodId) as 'BTC-CHAIN';

    return {
      storeId,
      paymentMethodId: resolvedPaymentMethodId,
      enabled,
      config: {
        derivationScheme,
        accountKey,
        accountKeyPath,
        masterFingerprint,
        label: label ?? derivedLabel
      }
    } satisfies OnchainPaymentMethodConfig;
  }

  private extractPreviewAddresses(source: unknown): OnchainPreviewAddressItem[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    const record = source as Record<string, unknown>;
    const candidates: unknown[] = [];

    if (Array.isArray(record.addresses)) {
      for (const address of record.addresses) {
        candidates.push(address);
      }
    }
    if (Array.isArray(record.addressPreview)) {
      for (const preview of record.addressPreview) {
        candidates.push(preview);
      }
    }

    return candidates
      .map((entry) => this.normalizeAddress(entry))
      .filter((entry): entry is OnchainPreviewAddressItem => Boolean(entry));
  }

  private normalizeAddress(entry: unknown): OnchainPreviewAddressItem | null {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed ? { address: trimmed } : null;
    }

    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const candidate = entry as PreviewAddressLike;
    const address = typeof candidate.address === 'string' ? candidate.address : null;
    if (!address) {
      return null;
    }
    const trimmed = address.trim();
    return trimmed ? { address: trimmed } : null;
  }

  private describeDerivationForLog(value: string): { type: string; prefix: string } {
    if (typeof value !== 'string') {
      return { type: 'unknown', prefix: '' };
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return { type: 'unknown', prefix: '' };
    }

    const normalized = trimmed.replace(/\s+/gu, '');
    const prefix = normalized.slice(0, 8);
    const extendedMatch = normalized.match(/^(xpub|ypub|zpub|tpub|upub|vpub)/iu);

    if (extendedMatch) {
      return { type: extendedMatch[1].toLowerCase(), prefix };
    }

    if (/^(?:wpkh|sh|pkh|wsh|tr|sortedmulti)\(/iu.test(normalized)) {
      return { type: 'descriptor', prefix };
    }

    return { type: 'unknown', prefix };
  }

  private extractCurrencyMetadata(source: unknown, fallback: string): string {
    let currency = fallback;

    if (!source || typeof source !== 'object') {
      return currency;
    }

    const record = source as Record<string, unknown>;
    const directCurrency = this.firstString([record.currency]);

    if (directCurrency) {
      currency = directCurrency.toUpperCase();
    }

    if (record.paymentMethod && typeof record.paymentMethod === 'object') {
      const paymentMethod = record.paymentMethod as Record<string, unknown>;
      const nestedCurrency = this.firstString([paymentMethod.currency]);
      if (nestedCurrency && currency === fallback) {
        currency = nestedCurrency.toUpperCase();
      }
    }

    return currency;
  }

  private extractConfigMetadata(
    config: unknown
  ): {
    derivationScheme: string | null;
    accountKey: string | null;
    accountKeyPath: string | null;
    masterFingerprint: string | null;
    label: string | null;
  } {
    if (!config) {
      return {
        derivationScheme: null,
        accountKey: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      };
    }

    if (typeof config === 'string') {
      const { masterFingerprint, keyPath } = this.parseAccountKeyPath(null);
      return {
        derivationScheme: config,
        accountKey: config,
        accountKeyPath: keyPath,
        masterFingerprint,
        label: null
      };
    }

    if (typeof config !== 'object') {
      return {
        derivationScheme: null,
        accountKey: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      };
    }

    const record = config as Record<string, unknown>;
    const derivationScheme = this.firstString([
      record.derivationScheme,
      record.accountDerivation,
      record.accountOriginal
    ]);
    const label = this.firstString([record.label]);

    let accountKey: string | null = null;
    let accountKeyPath: string | null = null;
    let masterFingerprint: string | null = null;

    if (typeof record.accountKeyPath === 'string' && record.accountKeyPath.trim()) {
      const parsed = this.parseAccountKeyPath(record.accountKeyPath.trim());
      accountKeyPath = parsed.keyPath;
      masterFingerprint = parsed.masterFingerprint;
    }

    if (!accountKeyPath && Array.isArray(record.accountKeySettings)) {
      const first = record.accountKeySettings.find((entry) => entry && typeof entry === 'object') as
        | Record<string, unknown>
        | undefined;
      if (first) {
        if (typeof first.accountKey === 'string' && first.accountKey.trim()) {
          accountKey = first.accountKey.trim();
        }
        if (typeof first.accountKeyPath === 'string' && first.accountKeyPath.trim()) {
          accountKeyPath = first.accountKeyPath.trim();
        } else if (first.accountKeyPath && typeof first.accountKeyPath === 'object') {
          const keyPath = (first.accountKeyPath as Record<string, unknown>).keyPath;
          if (typeof keyPath === 'string' && keyPath.trim()) {
            accountKeyPath = keyPath.trim();
          }
          const fp = (first.accountKeyPath as Record<string, unknown>).masterFingerprint;
          if (typeof fp === 'string' && fp.trim()) {
            masterFingerprint = fp.trim();
          }
        }
        if (!masterFingerprint && typeof first.masterFingerprint === 'string' && first.masterFingerprint.trim()) {
          masterFingerprint = first.masterFingerprint.trim();
        }
        if (!masterFingerprint && typeof first.rootFingerprint === 'string' && first.rootFingerprint.trim()) {
          masterFingerprint = first.rootFingerprint.trim();
        }
      }
    }

    if (!masterFingerprint && typeof record.masterFingerprint === 'string' && record.masterFingerprint.trim()) {
      masterFingerprint = record.masterFingerprint.trim();
    }

    if (!masterFingerprint && typeof record.rootFingerprint === 'string' && record.rootFingerprint.trim()) {
      masterFingerprint = record.rootFingerprint.trim();
    }

    return {
      derivationScheme: derivationScheme ?? null,
      accountKey: accountKey ?? derivationScheme ?? null,
      accountKeyPath,
      masterFingerprint: masterFingerprint ? masterFingerprint.toUpperCase() : null,
      label: label ?? null
    };
  }

  private firstString(values: Maybe<unknown>[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private parseAccountKeyPath(value: Maybe<string>): { masterFingerprint: string | null; keyPath: string | null } {
    if (!value) {
      return { masterFingerprint: null, keyPath: null };
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return { masterFingerprint: null, keyPath: null };
    }

    const segments = trimmed.split('/');
    if (segments.length === 0) {
      return { masterFingerprint: null, keyPath: trimmed };
    }

    const fingerprintCandidate = segments[0] ?? '';
    if (/^[0-9a-fA-F]{8}$/u.test(fingerprintCandidate)) {
      return {
        masterFingerprint: fingerprintCandidate.toUpperCase(),
        keyPath: segments.slice(1).join('/') || null
      };
    }

    const normalized = trimmed.replace(/^m\//i, '');
    return { masterFingerprint: null, keyPath: normalized };
  }

  private async prepareStoreContext(
    storeId: string,
    options?: PaymentMethodRequestOptions
  ): Promise<StoreContext> {
    const store = options?.store ?? (await this.lookupStore(storeId));
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const overrideApiKey = this.normalizeApiKey(options?.apiKeyOverride);
    const apiKey = overrideApiKey ?? this.decryptStoreApiKey(store);
    const baseUrl = this.resolveBaseUrl(store, options?.host ?? undefined);
    const http = this.createHttp(baseUrl, apiKey);
    return {
      store,
      apiKey,
      baseUrl,
      http,
      cleanup: () => this.clearBuffer(apiKey)
    } satisfies StoreContext;
  }

  private normalizeApiKey(value: string | null | undefined): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private resolveBaseUrl(store: ManagedStoreEntity, hostOverride?: string | null): string {
    const overrideHost = typeof hostOverride === 'string' && hostOverride.trim() ? hostOverride.trim() : undefined;
    const host = overrideHost ?? (store.btcpayHost && store.btcpayHost.trim() ? store.btcpayHost.trim() : undefined);
    return this.btcpayService.resolveBaseUrl(host);
  }

  private async resolvePreviewAddresses(
    context: StoreContext,
    paymentMethodId: string,
    initial: string[]
  ): Promise<string[]> {
    const normalized = this.normalizePreviewAddressesList(initial);
    if (normalized.length >= 1) {
      return normalized.slice(0, DEFAULT_PREVIEW_ADDRESS_COUNT);
    }

    try {
      const params = this.buildPreviewQueryParams();
      const response = await context.http.get(
        this.buildOnchainPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        { params }
      );
      const preview = this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        'BTC',
        paymentMethodId
      );
      const derived = preview.addresses
        .map((item) => item.address)
        .filter((value) => typeof value === 'string' && value.trim());
      return this.normalizePreviewAddressesList(derived).slice(0, DEFAULT_PREVIEW_ADDRESS_COUNT);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 0;
        if (status === 401) {
          throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
        }
        if (status === 403 || status === 404) {
          return [];
        }
      }
      this.logger.warn('Failed to load preview addresses for on-chain summary.');
      return [];
    }
  }

  private normalizePreviewAddressesList(addresses: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const entry of addresses) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      if (seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private decryptStoreApiKey(store: ManagedStoreEntity): string {
    try {
      return this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
      this.logger.error(`Failed to decrypt BTCPay API key for store ${store.btcpayStoreId}`);
      throw new InternalServerErrorException('Failed to decrypt BTCPay API key', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  private createHttp(baseUrl: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: {
        Accept: 'application/json',
        Authorization: `token ${apiKey}`,
        'User-Agent': 'PayPay-BFF/1.0'
      },
      timeout: 10_000,
      maxBodyLength: 2 * 1024 * 1024,
      maxContentLength: 2 * 1024 * 1024
    });
  }

  private async lookupStore(storeId: string): Promise<ManagedStoreEntity | null> {
    const trimmed = storeId.trim();
    if (!trimmed) {
      throw new NotFoundException('Store not found');
    }
    const where: FindOptionsWhere<ManagedStoreEntity>[] = isUuid(trimmed)
      ? [{ id: trimmed }, { btcpayStoreId: trimmed }]
      : [{ btcpayStoreId: trimmed }];
    const store = await this.storesRepository.findOne({ where });
    if (!store) {
      return null;
    }
    return store;
  }

  private buildModernPaymentMethodsCollectionPath(storeId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods`;
  }

  private buildOnchainPreviewPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet/preview`;
  }

  private buildOnchainGeneratePath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet/generate`;
  }

  private buildModernPaymentMethodPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`;
  }

  private combineTarget(baseUrl: string, path: string): string {
    try {
      return new URL(path, baseUrl).toString();
    } catch {
      const normalizedBase = typeof baseUrl === 'string' ? baseUrl.replace(/\/$/, '') : '';
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return `${normalizedBase}${normalizedPath}`;
    }
  }

  private descriptorContainsFingerprint(derivationScheme: string): boolean {
    if (typeof derivationScheme !== 'string') {
      return false;
    }
    return /\[[0-9a-f]{8}\//i.test(derivationScheme);
  }

  private extractPaymentMethodStatus(
    payload: unknown,
    fallbackPaymentMethodId: string
  ): PaymentMethodRecord | null {
    const candidates: PaymentMethodRecord[] = [];
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        if (entry && typeof entry === 'object') {
          candidates.push(entry as PaymentMethodRecord);
        }
      }
    } else if (payload && typeof payload === 'object') {
      candidates.push(payload as PaymentMethodRecord);
    }

    if (candidates.length === 0) {
      return null;
    }

    const fallback = canonicalPaymentMethodId(fallbackPaymentMethodId, 'chain');

    const match = candidates.find((record) => {
      if (typeof record.paymentMethodId !== 'string') {
        return false;
      }
      const normalized = canonicalPaymentMethodId(record.paymentMethodId, 'chain');
      if (!normalized) {
        return false;
      }
      return normalized === fallback;
    });

    return match ?? candidates[0] ?? null;
  }

  private handleBtcpayError(error: unknown): never {
    if (axios.isAxiosError<unknown>(error)) {
      const status = error.response?.status ?? 502;
      const data = this.getResponseData(error);
      const message = this.extractErrorMessage(error);
      if (status === 401) {
        throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
      }
      if (status === 403) {
        throw new ForbiddenException('BTCPay returned limited permissions', { cause: error as Error });
      }
      if (status === 404) {
        throw new NotFoundException(message, { cause: error as Error });
      }
      if (status === 422) {
        const payload = this.normalizeErrorPayload(data) ?? message;
        throw new HttpException(payload ?? INVALID_DERIVATION_MESSAGE, 422, {
          cause: error as Error
        });
      }
      if (status >= 400 && status < 500) {
        throw new HttpException(message, status, { cause: error as Error });
      }
      throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
    }

    if (
      error instanceof UnauthorizedException ||
      error instanceof NotFoundException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }

    throw new BadGatewayException('BTCPay request failed', { cause: error instanceof Error ? error : undefined });
  }

  private handleUpdatePaymentMethodError(error: unknown): never {
    if (axios.isAxiosError<unknown>(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        throw new BTCPayAuthError('BTCPay authentication failed', error);
      }
      const message = this.extractErrorMessage(error);
      throw new BTCPayUpstreamError(message, error, status);
    }

    throw new BTCPayUpstreamError('Upstream error', error);
  }

  private shouldRetryWithAccountKeySettings(error: unknown): boolean {
    if (!axios.isAxiosError<unknown>(error)) {
      return false;
    }

    const status = error.response?.status ?? 0;
    if (status !== 422) {
      return false;
    }

    const data = this.getResponseData(error);
    const paths = this.extractValidationPaths(data);
    return paths.some((path) => path.toLowerCase().includes('accountkeysettings'));
  }

  private extractErrorMessage(error: AxiosError<unknown>): string {
    const data = this.getResponseData(error);
    const payloadMessage = this.resolveErrorMessage(data);
    if (payloadMessage) {
      return payloadMessage;
    }

    const fallback = typeof error.message === 'string' ? this.sanitizeMessage(error.message) : '';
    if (fallback) {
      return fallback;
    }

    return 'BTCPay request failed';
  }

  private mapPreviewError(
    error: unknown,
    context: Record<string, unknown> = {}
  ): HttpException {
    if (!axios.isAxiosError<{ code?: string; message?: string }>(error)) {
      this.logger.warn({ ...context, status: 0, code: undefined, errorMessage: 'BTCPay preview failed' }, 'btcpayPreview');
      return new BadGatewayException('BTCPay preview failed');
    }

    const status = error.response?.status ?? 500;
    const rawPayload = this.getResponseData(error);
    const normalizedPayload = this.normalizeErrorPayload(rawPayload);
    const code = this.extractErrorCode(rawPayload);
    const resolvedMessage = this.resolveErrorMessage(rawPayload);
    const fallback = resolvedMessage ?? this.extractErrorMessage(error) ?? 'BTCPay preview failed';

    this.logger.warn(
      { ...context, status, code: code ?? undefined, errorMessage: fallback },
      'btcpayPreview'
    );

    if (status === 404 && code === 'paymentmethod-not-configured') {
      return this.buildValidationException(
        { message: 'Payment method is not configured yet.', code },
        error as Error
      );
    }
    if (status === 401) {
      return new UnauthorizedException();
    }
    if (status === 403) {
      return new ForbiddenException();
    }
    if (status === 400 || status === 422) {
      if (typeof rawPayload === 'string') {
        const sanitized = this.sanitizeMessage(rawPayload) || fallback;
        return this.buildValidationException(sanitized);
      }
      if (this.isRecord(rawPayload) && typeof rawPayload.message === 'string') {
        const sanitizedMessage = this.sanitizeMessage(rawPayload.message) || fallback;
        const responsePayload: Record<string, unknown> = { message: sanitizedMessage };
        const payloadCode = this.extractErrorCode(rawPayload);
        if (payloadCode) {
          responsePayload.code = payloadCode;
        }
        return this.buildValidationException(responsePayload);
      }
      const responsePayload = normalizedPayload ?? fallback;
      return this.buildValidationException(responsePayload ?? 'BTCPay validation failed');
    }
    if (status === 404) {
      return new NotFoundException(normalizedPayload ?? fallback);
    }

    return new BadGatewayException('BTCPay preview failed');
  }

  private mapPreviewAddressesError(
    error: unknown,
    context: Record<string, unknown> = {}
  ): Error {
    if (axios.isAxiosError<unknown>(error)) {
      const status = error.response?.status ?? 0;
      const rawPayload = this.getResponseData(error);
      const payload = this.normalizeErrorPayload(rawPayload);
      const resolvedMessage = this.resolveErrorMessage(rawPayload);
      const message = resolvedMessage ?? this.extractErrorMessage(error);
      const code = this.extractErrorCode(rawPayload);
      const mode =
        typeof context.mode === 'string' && context.mode === 'descriptor'
          ? 'descriptor'
          : 'tpub';

      this.logger.warn(
        { ...context, status, code: code ?? undefined, errorMessage: message ?? 'BTCPay request failed' },
        'btcpayPreview'
      );

      if (status === 401) {
        return new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
      }

      if (status === 403) {
        return new ForbiddenException('BTCPay returned limited permissions', {
          cause: error as Error
        });
      }

      if (status === 400 || status === 422) {
        return this.buildBadRequestException(rawPayload ?? payload ?? message, mode, error as Error);
      }

      if (status === 404 && code === 'paymentmethod-not-configured') {
        return this.buildValidationException(
          { message: 'Payment method is not configured yet.', code: code ?? 'paymentmethod-not-configured' },
          error as Error
        );
      }

      if (status === 404) {
        return new ForbiddenException('API key is not scoped to this store or storeId is wrong', {
          cause: error as Error
        });
      }

      if (status >= 400 && status < 500) {
        const responsePayload = payload ?? message ?? 'BTCPay request failed';
        return new HttpException(responsePayload, status, { cause: error as Error });
      }

      if (status >= 500) {
        return new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }
      return new BadGatewayException(message ?? 'BTCPay request failed', {
        cause: error as Error
      });
    }

    this.logger.warn({ ...context, status: 0, code: undefined, errorMessage: 'BTCPay request failed' }, 'btcpayPreview');

    return new BadGatewayException('BTCPay request failed', {
      cause: error instanceof Error ? error : undefined
    });
  }

  private buildValidationException(
    payload: string | Record<string, unknown>,
    cause?: Error
  ): UnprocessableEntityException {
    if (typeof payload === 'string') {
      const sanitized = this.sanitizeMessage(payload);
      return new BtcpayValidationException(sanitized, { cause });
    }

    return new BtcpayValidationException(payload, { cause });
  }

  private buildBadRequestException(
    payload: unknown,
    mode: 'descriptor' | 'tpub' | 'save',
    cause?: Error
  ): BadRequestException {
    const { message, code } = this.translateValidationMessage(payload, mode);
    const response: Record<string, unknown> = { message };
    if (code) {
      response.code = code;
    }
    return new BadRequestException(response, { cause });
  }

  private translateValidationMessage(
    payload: unknown,
    mode: 'descriptor' | 'tpub' | 'save'
  ): { message: string; code?: string } {
    const code = this.extractErrorCode(payload);
    const resolved = this.resolveErrorMessage(payload);
    const sanitizedResolved = resolved ? this.sanitizeMessage(resolved) : '';
    const normalized = sanitizedResolved ? sanitizedResolved.toLowerCase() : '';
    const paths = this.extractValidationPaths(payload).map((path) => path.toLowerCase());

    if (normalized.includes('missing config')) {
      return {
        message:
          'Config payload is required for preview requests using extended public keys. Use the descriptor preview endpoint instead if you have a descriptor.',
        code: code ?? 'missing-config'
      };
    }

    if (normalized.includes('invalid derivation strategy') || normalized.includes('invalid account derivation')) {
      return {
        message:
          'Account derivation expects an extended public key. Use the descriptor preview endpoint when working with descriptors.',
        code: code ?? 'invalid-account-derivation'
      };
    }

    if (normalized.includes('accountkeysettings') || paths.some((path) => path.includes('accountkeysettings'))) {
      return {
        message:
          "AccountKeySettings require an 8-character master fingerprint and a BIP84/BIP86 account key path (for example 84'/1'/0').",
        code: code ?? 'invalid-account-key-settings'
      };
    }

    if (sanitizedResolved) {
      return { message: sanitizedResolved, code: code ?? this.resolveDefaultValidationCode(mode) };
    }

    const fallbackCode = code ?? this.resolveDefaultValidationCode(mode);
    const fallbackMessage = mode === 'descriptor'
      ? 'BTCPay rejected the descriptor. Confirm the syntax and the m/ account path.'
      : 'BTCPay rejected the wallet configuration. Verify the extended public key, root fingerprint, and account path.';

    return { message: fallbackMessage, code: fallbackCode };
  }

  private resolveDefaultValidationCode(mode: 'descriptor' | 'tpub' | 'save'): string {
    switch (mode) {
      case 'descriptor':
        return 'descriptor-validation-error';
      case 'tpub':
      case 'save':
        return 'wallet-validation-error';
      default:
        return 'validation-error';
    }
  }

  private mapSaveOnchainError(
    error: unknown,
    context: Record<string, unknown> = {}
  ): Error {
    if (axios.isAxiosError<unknown>(error)) {
      const status = error.response?.status ?? 0;
      const rawPayload = this.getResponseData(error);
      const payload = this.normalizeErrorPayload(rawPayload);
      const resolvedMessage = this.resolveErrorMessage(rawPayload);
      const message = resolvedMessage ?? this.extractErrorMessage(error);
      const code = this.extractErrorCode(rawPayload);

      this.logger.warn(
        { ...context, status, code: code ?? undefined, errorMessage: message ?? 'BTCPay request failed' },
        'btcpaySave'
      );

      if (status === 400 || status === 422) {
        return this.buildBadRequestException(rawPayload ?? payload ?? message, 'save', error as Error);
      }

      if (status === 401) {
        return new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
      }

      if (status === 403) {
        return new ForbiddenException('BTCPay returned limited permissions', { cause: error as Error });
      }

      if (status === 404) {
        return new NotFoundException('BTCPay store or payment method not found', { cause: error as Error });
      }

      if (status >= 500) {
        return new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }

      if (status >= 400 && status < 500) {
        return new HttpException(payload ?? message ?? 'BTCPay request failed', status, {
          cause: error as Error
        });
      }

      return new BadGatewayException(message ?? 'BTCPay request failed', { cause: error as Error });
    }

    return new BadGatewayException('BTCPay request failed', {
      cause: error instanceof Error ? error : undefined
    });
  }

  private mapGenerateWalletError(error: unknown): Error {
    if (axios.isAxiosError<unknown>(error)) {
      const status = error.response?.status ?? 0;
      const payload = this.normalizeErrorPayload(this.getResponseData(error));
      const message = this.extractErrorMessage(error);

      if (status === 400 || status === 422) {
        const responsePayload = payload ?? message ?? 'BTCPay validation failed';
        return new UnprocessableEntityException(responsePayload, {
          cause: error as Error
        });
      }

      if (status === 401) {
        return new UnauthorizedException(message || 'BTCPay authentication failed', { cause: error as Error });
      }

      if (status === 403) {
        return new ForbiddenException(message || 'BTCPay returned limited permissions', { cause: error as Error });
      }

      if (status >= 500) {
        return new BadGatewayException(message || 'BTCPay request failed', { cause: error as Error });
      }

      if (status >= 400 && status < 500) {
        const responsePayload = payload ?? message ?? 'BTCPay request failed';
        return new HttpException(responsePayload, status, { cause: error as Error });
      }

      return new BadGatewayException(message || 'BTCPay request failed', { cause: error as Error });
    }

    return new BadGatewayException('BTCPay request failed', {
      cause: error instanceof Error ? error : undefined
    });
  }

  private firstErrorMessage(errors: unknown[]): string | null {
    for (const entry of errors) {
      if (!this.isRecord(entry)) {
        continue;
      }
      const message = this.firstString([entry.message, entry.error]);
      if (message) {
        return message;
      }
    }
    return null;
  }

  private getResponseData(error: AxiosError<unknown>): unknown {
    return error.response?.data;
  }

  private extractErrorCode(data: unknown): string | undefined {
    if (this.isRecord(data)) {
      const code = data.code;
      if (typeof code === 'string') {
        const trimmed = code.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
    }
    return undefined;
  }

  private normalizeErrorPayload(data: unknown): string | Record<string, unknown> | null {
    if (typeof data === 'string') {
      const sanitized = this.sanitizeMessage(data);
      return sanitized ? sanitized : null;
    }
    if (this.isRecord(data)) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          sanitized[key] = this.sanitizeMessage(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    return null;
  }

  private extractValidationPaths(data: unknown): string[] {
    const paths: string[] = [];

    const collect = (entry: unknown): void => {
      if (!this.isRecord(entry)) {
        return;
      }
      if (typeof entry.path === 'string' && entry.path.trim()) {
        paths.push(entry.path.trim());
      }
      if (Array.isArray(entry.children)) {
        for (const child of entry.children) {
          collect(child);
        }
      }
    };

    if (this.isRecord(data)) {
      if (Array.isArray(data.errors)) {
        for (const error of data.errors) {
          collect(error);
        }
      }
      const validationErrors = data.validationErrors;
      if (Array.isArray(validationErrors)) {
        for (const error of validationErrors) {
          collect(error);
        }
      }
    }

    return paths;
  }

  private isExtendedPublicKey(candidate: string): boolean {
    if (typeof candidate !== 'string') {
      return false;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return false;
    }

    return /^(?:xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]+$/iu.test(trimmed);
  }

  private resolveErrorMessage(data: unknown): string | null {
    if (typeof data === 'string') {
      const sanitized = this.sanitizeMessage(data);
      return sanitized || null;
    }
    if (this.isRecord(data)) {
      const message = this.firstString([
        data.message,
        data.error,
        Array.isArray(data.errors) ? this.firstErrorMessage(data.errors) : null
      ]);
      if (message) {
        return this.sanitizeMessage(message);
      }
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private sanitizeMessage(value: string): string {
    return value.replace(/\p{Cc}+/gu, ' ').trim();
  }

  private clearBuffer(value: string | null | undefined): void {
    if (!value) {
      return;
    }
    try {
      const buffer = Buffer.from(value, 'utf8');
      buffer.fill(0);
    } catch {
      // ignore best-effort failures
    }
  }
}
