import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { BtcpayService } from './btcpay.service';
import { BTCPayAuthError, BTCPayUpstreamError } from './btcpay.errors';

type Maybe<T> = T | null | undefined;

const INVALID_DERIVATION_MESSAGE =
  "Invalid derivation scheme. Examples: xpub..., ypub..., wpkh([FPR/...']xpub.../0/*). Set AccountKeyPath like m/84'/0'/0'.";

export const DEFAULT_PREVIEW_ADDRESS_COUNT = 10;

export interface OnchainPreviewConfig {
  derivationScheme?: string;
  accountKeyPath?: string | null;
  label?: string | null;
}

export interface OnchainPreviewRequest {
  offset?: number;
  amount?: number;
  config?: OnchainPreviewConfig | null;
}

export interface OnchainPreviewAddressItem {
  address: string;
  keyPath: string | null;
  index: number | null;
}

export interface OnchainPreviewResponse {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  addresses: OnchainPreviewAddressItem[];
}

export interface OnchainPaymentMethodConfig {
  storeId: string;
  currency: string;
  paymentMethodId: string;
  enabled: boolean;
  config: {
    derivationScheme: string | null;
    accountKeyPath: string | null;
    masterFingerprint: string | null;
    label: string | null;
  };
}

export interface OnchainPaymentMethodStatus {
  storeId: string;
  paymentMethodId: string;
  enabled: boolean;
}

export interface UpdateOnchainPaymentMethodPayload {
  enabled: boolean;
  config: {
    derivationScheme: string;
    accountKeyPath?: string | null;
    label?: string | null;
    masterFingerprint?: string | null;
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
}

export interface UpdateOnchainPaymentMethodRequest {
  storeId: string;
  cryptoCode: string;
  derivationScheme: string;
  accountKeyPath?: string | null;
  masterFingerprint?: string | null;
  label?: string | null;
  enabled?: boolean;
}

export interface UpdateOnchainPaymentMethodOptions extends PaymentMethodRequestOptions {
  apiKey: string;
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

@Injectable()
export class BtcpayPaymentMethodsService {
  private readonly logger = new Logger(BtcpayPaymentMethodsService.name, { timestamp: false });

  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly btcpayService: BtcpayService
  ) {}

  // BTCPay Greenfield API v1 (BTCPay Server ≥ 2.x) exposes previewing via GET /payment-methods/{paymentMethodId}/wallet/preview.
  // Refer to the Swagger UI on the target instance (/docs) for the canonical schema.
  async previewOnchain(
    storeId: string,
    currencyCode = 'BTC',
    body?: OnchainPreviewRequest,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPreviewResponse> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = currencyCode.toUpperCase();
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');
    try {
      this.logger.debug(
        `Previewing on-chain wallet via modern endpoint for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
      );
      const payload = this.buildPreviewRequestParams(body);
      const response = await context.http.get(
        this.buildModernPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        { params: payload }
      );
      return this.normalizePreviewResponse(
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

    throw new InternalServerErrorException('Failed to preview on-chain payment method.');
  }

  // BTCPay Greenfield API v1 surfaces configuration at /payment-methods/{paymentMethodId}.
  // Refer to the Swagger UI on the target instance (/docs) for the canonical schema.
  async getOnchain(
    storeId: string,
    currencyCode = 'BTC',
    options?: PaymentMethodRequestOptions & { includeConfig?: boolean }
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = currencyCode.toUpperCase();
    const paymentMethodId = normalizePaymentMethodId(currency, 'chain');
    const params: Record<string, string> = {};
    if (options?.includeConfig === true) {
      params.includeConfig = 'true';
    }

    try {
      const response = await context.http.get(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        Object.keys(params).length > 0 ? { params } : undefined
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

    throw new InternalServerErrorException('Failed to retrieve on-chain payment method.');
  }

  async getOnchainMethodStatus(
    storeId: string,
    paymentMethodId = 'BTC-OnChain',
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
            onlyEnabled: 'false',
            includeConfig: 'false'
          }
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
    options: UpdateOnchainPaymentMethodOptions
  ): Promise<void> {
    const context = await this.prepareStoreContext(params.storeId, {
      store: options.store,
      apiKeyOverride: options.apiKey
    });
    const paymentMethodId = normalizePaymentMethodId(params.cryptoCode, 'chain');
    const body = this.buildUpdateRequestBody({
      enabled: params.enabled ?? true,
      config: {
        derivationScheme: params.derivationScheme,
        accountKeyPath: params.accountKeyPath,
        masterFingerprint: params.masterFingerprint,
        label: params.label
      }
    });

    try {
      await context.http.put(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        body
      );
    } catch (error) {
      this.handleUpdatePaymentMethodError(error);
    } finally {
      context.cleanup();
    }
  }

  private buildPreviewRequestParams(body?: OnchainPreviewRequest): Record<string, string> {
    const params: Record<string, string> = {};

    const offset = Number.isFinite(body?.offset) ? Math.max(0, Math.trunc(body?.offset ?? 0)) : 0;
    const amount = Number.isFinite(body?.amount) && (body?.amount ?? 0) > 0
      ? Math.max(1, Math.trunc(body?.amount ?? DEFAULT_PREVIEW_ADDRESS_COUNT))
      : DEFAULT_PREVIEW_ADDRESS_COUNT;

    params.offset = String(offset);
    params.amount = String(amount);

    const config = this.normalizePreviewConfig(body?.config);
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.trim()) {
        params[key] = value.trim();
      }
    }

    return params;
  }

  private buildUpdateRequestBody(payload: UpdateOnchainPaymentMethodPayload): Record<string, unknown> {
    const config = this.buildUpdateConfigPayload(payload.config);
    return { enabled: payload.enabled, config };
  }

  private normalizePreviewConfig(config: OnchainPreviewConfig | null | undefined): Record<string, string> {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const payload: Record<string, string> = {};

    if (typeof config.derivationScheme === 'string' && config.derivationScheme.trim()) {
      payload.derivationScheme = config.derivationScheme.trim();
    }

    if (config.accountKeyPath !== undefined) {
      if (typeof config.accountKeyPath === 'string' && config.accountKeyPath.trim()) {
        payload.accountKeyPath = config.accountKeyPath.trim();
      }
    }

    if (typeof config.label === 'string' && config.label.trim()) {
      payload.label = config.label.trim();
    }

    return payload;
  }

  private buildUpdateConfigPayload(
    config: UpdateOnchainPaymentMethodPayload['config']
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    payload.derivationScheme = config.derivationScheme;

    if (config.accountKeyPath !== undefined) {
      if (config.accountKeyPath === null) {
        payload.accountKeyPath = null;
      } else if (typeof config.accountKeyPath === 'string' && config.accountKeyPath.trim()) {
        payload.accountKeyPath = config.accountKeyPath;
      }
    }

    if (typeof config.label === 'string' && config.label.trim()) {
      payload.label = config.label;
    }

    if (config.masterFingerprint !== undefined) {
      if (config.masterFingerprint === null) {
        payload.masterFingerprint = null;
      } else if (typeof config.masterFingerprint === 'string' && config.masterFingerprint.trim()) {
        payload.masterFingerprint = config.masterFingerprint.trim().toUpperCase();
      }
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
    fallbackCurrency: string,
    fallbackPaymentMethodId: string
  ): OnchainPaymentMethodConfig {
    if (!payload) {
      throw new InternalServerErrorException('BTCPay returned an empty response.');
    }

    let enabled = false;
    let paymentMethodId = fallbackPaymentMethodId;
    let currency = fallbackCurrency;
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
      currency = this.extractCurrencyMetadata(record, fallbackCurrency);
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

    const { derivationScheme, accountKeyPath, masterFingerprint, label: derivedLabel } =
      this.extractConfigMetadata(configPayload);
    currency = this.extractCurrencyMetadata(payload, currency);

    const resolvedPaymentMethodId = canonicalPaymentMethodId(paymentMethodId, 'chain') || paymentMethodId;

    return {
      storeId,
      currency,
      paymentMethodId: resolvedPaymentMethodId,
      enabled,
      config: {
        derivationScheme,
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
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const candidate = entry as PreviewAddressLike;
    const address = typeof candidate.address === 'string' ? candidate.address : null;
    const keyPath = typeof candidate.keyPath === 'string' ? candidate.keyPath : null;
    const index = typeof candidate.index === 'number' && Number.isFinite(candidate.index)
      ? Math.trunc(candidate.index)
      : null;
    if (!address) {
      return null;
    }
    return { address, keyPath, index };
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
  ): { derivationScheme: string | null; accountKeyPath: string | null; masterFingerprint: string | null; label: string | null } {
    if (!config) {
      return { derivationScheme: null, accountKeyPath: null, masterFingerprint: null, label: null };
    }

    if (typeof config === 'string') {
      const { masterFingerprint, keyPath } = this.parseAccountKeyPath(null);
      return {
        derivationScheme: config,
        accountKeyPath: keyPath,
        masterFingerprint,
        label: null
      };
    }

    if (typeof config !== 'object') {
      return { derivationScheme: null, accountKeyPath: null, masterFingerprint: null, label: null };
    }

    const record = config as Record<string, unknown>;
    const derivationScheme = this.firstString([
      record.derivationScheme,
      record.accountDerivation,
      record.accountOriginal
    ]);
    const label = this.firstString([record.label]);

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
        if (!masterFingerprint && typeof first.rootFingerprint === 'string' && first.rootFingerprint.trim()) {
          masterFingerprint = first.rootFingerprint.trim();
        }
      }
    }

    if (!masterFingerprint && typeof record.masterFingerprint === 'string' && record.masterFingerprint.trim()) {
      masterFingerprint = record.masterFingerprint.trim();
    }

    return { derivationScheme: derivationScheme ?? null, accountKeyPath, masterFingerprint, label: label ?? null };
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
    if (/^[0-9a-fA-F]{8}$/.test(fingerprintCandidate)) {
      return {
        masterFingerprint: fingerprintCandidate.toLowerCase(),
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
    const baseUrl = this.resolveBaseUrl(store);
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

  private resolveBaseUrl(store: ManagedStoreEntity): string {
    const host = store.btcpayHost && store.btcpayHost.trim() ? store.btcpayHost.trim() : undefined;
    return this.btcpayService.resolveBaseUrl(host);
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
        'Content-Type': 'application/json',
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
    const store = await this.storesRepository.findOne({
      where: [{ btcpayStoreId: trimmed }, { id: trimmed }]
    });
    if (!store) {
      return null;
    }
    return store;
  }

  private buildModernPaymentMethodsCollectionPath(storeId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods`;
  }

  private buildModernPreviewPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet/preview`;
  }

  private buildModernPaymentMethodPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`;
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
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const message = this.extractErrorMessage(error);
      if ([400, 409, 422].includes(status)) {
        throw new UnprocessableEntityException(message, { cause: error as Error });
      }
      if (status === 401) {
        throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
      }
      if (status === 403) {
        throw new ForbiddenException('BTCPay returned limited permissions', { cause: error as Error });
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
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        throw new BTCPayAuthError('BTCPay authentication failed', error);
      }
      throw new BTCPayUpstreamError('Upstream error', error, status);
    }

    throw new BTCPayUpstreamError('Upstream error', error);
  }

  private extractErrorMessage(error: AxiosError): string {
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim()) {
      return this.rewriteValidationMessage(data.trim());
    }
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const message = this.firstString([
        record.message,
        record.error,
        Array.isArray(record.errors) ? this.firstErrorMessage(record.errors) : null
      ]);
      if (message) {
        return this.rewriteValidationMessage(message);
      }
    }
    return this.rewriteValidationMessage(INVALID_DERIVATION_MESSAGE);
  }

  private firstErrorMessage(errors: unknown[]): string | null {
    for (const entry of errors) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const message = this.firstString([record.message, record.error]);
      if (message) {
        return message;
      }
    }
    return null;
  }

  private rewriteValidationMessage(message: string): string {
    const normalized = message.trim();
    if (!normalized) {
      return INVALID_DERIVATION_MESSAGE;
    }
    if (/mnemonic|seed|xprv|yprv|zprv/i.test(normalized)) {
      return 'Seeds or private keys must never be uploaded. Provide an xpub/ypub/zpub or NBX expression only.';
    }
    if (/derivation|config|xpub|ypub|zpub|wpkh|account/i.test(normalized)) {
      return normalized;
    }
    if (normalized.length <= 160) {
      return normalized;
    }
    return `${normalized.slice(0, 157)}...`;
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
