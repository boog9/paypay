import {
  BadGatewayException,
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

type Maybe<T> = T | null | undefined;

const INVALID_DERIVATION_MESSAGE =
  "Invalid derivation scheme. Examples: xpub..., ypub..., wpkh([FPR/...']xpub.../0/*). Set AccountKeyPath like m/84'/0'/0'.";

export const DEFAULT_PREVIEW_ADDRESS_COUNT = 10;

export interface OnchainPreviewRequest {
  derivationScheme: string;
  accountKeyPath?: string | null;
  label?: string | null;
  offset?: number;
  amount?: number;
}

export interface OnchainPreviewAddressItem {
  address: string;
  keyPath: string | null;
  index: number | null;
}

export interface OnchainPreviewResponse {
  storeId: string;
  currency: string;
  cryptoCode: string;
  paymentMethodId: string;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  addresses: OnchainPreviewAddressItem[];
}

export interface OnchainPaymentMethodConfig {
  storeId: string;
  currency: string;
  cryptoCode: string;
  paymentMethodId: string;
  enabled: boolean;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  label: string | null;
}

export interface UpdateOnchainPaymentMethodPayload {
  enabled: boolean;
  derivationScheme: string;
  accountKeyPath?: string | null;
  label?: string | null;
}

interface PaymentMethodRequestOptions {
  store?: ManagedStoreEntity;
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

  // BTCPay 2.x renamed /onchain/{crypto}/preview → /payment-methods/{paymentMethodId}/wallet/preview; data→config, cryptoCode→currency, paymentMethodId BTC-CHAIN.
  // See https://docs.btcpayserver.org/Development/Greenfield/
  async previewOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    body?: OnchainPreviewRequest,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPreviewResponse> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = cryptoCode.toUpperCase();
    const paymentMethodId = this.buildPaymentMethodId(currency);
    const params = this.buildPreviewRequestParams(body);

    try {
      this.logger.debug(
        `Previewing on-chain wallet via modern endpoint for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
      );
      const response = await context.http.get(
        this.buildModernPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        { params }
      );
      return this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (error) {
      if (this.shouldAttemptFallback(error)) {
        this.logger.debug(
          `Falling back to legacy preview endpoint for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
        );
        return this.previewOnchainLegacy(context, currency, paymentMethodId, body);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to preview on-chain payment method.');
  }

  // BTCPay 2.x renamed /payment-methods/onchain/{crypto} → /payment-methods/{paymentMethodId}; data→config, cryptoCode→currency, paymentMethodId BTC-CHAIN.
  // See https://docs.btcpayserver.org/Development/Greenfield/
  async getOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    options?: PaymentMethodRequestOptions & { includeConfig?: boolean }
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = cryptoCode.toUpperCase();
    const paymentMethodId = this.buildPaymentMethodId(currency);
    const params: Record<string, string> = {};
    if (options?.includeConfig !== false) {
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
      if (this.shouldAttemptFallback(error)) {
        return this.getOnchainLegacy(context, currency, paymentMethodId, options?.includeConfig !== false);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to retrieve on-chain payment method.');
  }

  // BTCPay 2.x renamed /payment-methods/onchain/{crypto} → /payment-methods/{paymentMethodId}; data→config, cryptoCode→currency, paymentMethodId BTC-CHAIN.
  // See https://docs.btcpayserver.org/Development/Greenfield/
  async updateOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    payload: UpdateOnchainPaymentMethodPayload,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const currency = cryptoCode.toUpperCase();
    const paymentMethodId = this.buildPaymentMethodId(currency);
    const requestBody = this.buildUpdateRequestBody(payload);

    try {
      const response = await context.http.put(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        requestBody
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (error) {
      if (this.shouldAttemptFallback(error)) {
        return this.updateOnchainLegacy(context, currency, payload, paymentMethodId);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to update on-chain payment method.');
  }

  private async previewOnchainLegacy(
    context: StoreContext,
    currency: string,
    paymentMethodId: string,
    body?: OnchainPreviewRequest
  ): Promise<OnchainPreviewResponse> {
    const path = this.buildLegacyPreviewPath(context.store.btcpayStoreId, currency);
    try {
      this.logger.debug(
        `Attempting legacy GET preview for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
      );
      const response = await context.http.get(path, { params: this.buildLegacyPreviewParams(body) });
      this.logger.debug(
        `Legacy GET preview succeeded for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
      );
      return this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (fallbackError) {
      if (this.shouldAttemptFallback(fallbackError)) {
        try {
          this.logger.debug(
            `Legacy GET preview rejected; attempting POST fallback for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
          );
          const response = await context.http.post(path, this.buildLegacyPreviewBody(body));
          this.logger.debug(
            `Legacy POST preview succeeded for store ${context.store.btcpayStoreId} (${paymentMethodId}).`
          );
          return this.normalizePreviewResponse(
            response.data,
            context.store.btcpayStoreId,
            currency,
            paymentMethodId
          );
        } catch (postError) {
          if (this.shouldAttemptFallback(postError)) {
            const cause = axios.isAxiosError(postError)
              ? (postError as Error)
              : postError instanceof Error
                ? postError
                : undefined;
            throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE, { cause });
          }
          this.handleBtcpayError(postError);
        }
      }
      this.handleBtcpayError(fallbackError);
    }
  }

  private async getOnchainLegacy(
    context: StoreContext,
    currency: string,
    paymentMethodId: string,
    includeConfig: boolean
  ): Promise<OnchainPaymentMethodConfig> {
    try {
      const response = await context.http.get(
        this.buildLegacyPaymentMethodPath(context.store.btcpayStoreId, currency),
        includeConfig ? undefined : { params: { includeConfig: 'false' } }
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (fallbackError) {
      if (this.shouldAttemptFallback(fallbackError)) {
        const cause = axios.isAxiosError(fallbackError)
          ? (fallbackError as Error)
          : fallbackError instanceof Error
            ? fallbackError
            : undefined;
        throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE, { cause });
      }
      this.handleBtcpayError(fallbackError);
      throw new InternalServerErrorException('Failed to retrieve on-chain payment method.');
    }
  }

  private async updateOnchainLegacy(
    context: StoreContext,
    currency: string,
    payload: UpdateOnchainPaymentMethodPayload,
    paymentMethodId: string
  ): Promise<OnchainPaymentMethodConfig> {
    try {
      const response = await context.http.put(
        this.buildLegacyPaymentMethodPath(context.store.btcpayStoreId, currency),
        this.buildLegacyUpdateBody(payload)
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        currency,
        paymentMethodId
      );
    } catch (fallbackError) {
      if (this.shouldAttemptFallback(fallbackError)) {
        const cause = axios.isAxiosError(fallbackError)
          ? (fallbackError as Error)
          : fallbackError instanceof Error
            ? fallbackError
            : undefined;
        throw new UnprocessableEntityException(INVALID_DERIVATION_MESSAGE, { cause });
      }
      this.handleBtcpayError(fallbackError);
      throw new InternalServerErrorException('Failed to update on-chain payment method.');
    }
  }

  private buildPreviewRequestParams(body?: OnchainPreviewRequest): Record<string, string> {
    const params: Record<string, string> = {
      offset: String(body?.offset ?? 0),
      amount: String(body?.amount ?? DEFAULT_PREVIEW_ADDRESS_COUNT)
    };

    const config: Record<string, unknown> = {};
    if (body?.derivationScheme) {
      config.derivationScheme = body.derivationScheme;
    }
    if (body?.accountKeyPath) {
      config.accountKeyPath = body.accountKeyPath;
    }
    if (body?.label) {
      config.label = body.label;
    }

    if (Object.keys(config).length > 0) {
      params.config = JSON.stringify(config);
    }

    return params;
  }

  private buildPreviewRequestBody(body?: OnchainPreviewRequest): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    if (body?.derivationScheme) {
      config.derivationScheme = body.derivationScheme;
    }
    if (body?.accountKeyPath) {
      config.accountKeyPath = body.accountKeyPath;
    }
    if (body?.label) {
      config.label = body.label;
    }
    return { config };
  }

  private buildLegacyPreviewParams(body?: OnchainPreviewRequest): Record<string, string> {
    const params = this.buildPreviewRequestParams(body);
    delete params.config;
    return params;
  }

  private buildLegacyPreviewBody(body?: OnchainPreviewRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      offset: body?.offset ?? 0,
      amount: body?.amount ?? DEFAULT_PREVIEW_ADDRESS_COUNT
    };
    if (body?.derivationScheme) {
      payload.derivationScheme = body.derivationScheme;
    }
    if (body?.accountKeyPath) {
      payload.accountKeyPath = body.accountKeyPath;
    }
    if (body?.label) {
      payload.label = body.label;
    }
    return payload;
  }

  private buildUpdateRequestBody(payload: UpdateOnchainPaymentMethodPayload): Record<string, unknown> {
    const config: Record<string, unknown> = { derivationScheme: payload.derivationScheme };
    if (payload.accountKeyPath) {
      config.accountKeyPath = payload.accountKeyPath;
    }
    if (payload.label) {
      config.label = payload.label;
    }
    const request: Record<string, unknown> = { enabled: payload.enabled, config };
    return request;
  }

  private buildLegacyUpdateBody(payload: UpdateOnchainPaymentMethodPayload): Record<string, unknown> {
    const request: Record<string, unknown> = {
      enabled: payload.enabled,
      derivationScheme: payload.derivationScheme
    };
    if (payload.accountKeyPath) {
      request.accountKeyPath = payload.accountKeyPath;
    }
    if (payload.label) {
      request.label = payload.label;
    }
    return request;
  }

  private normalizePreviewResponse(
    source: unknown,
    storeId: string,
    fallbackCurrency: string,
    paymentMethodId: string
  ): OnchainPreviewResponse {
    const addresses = this.extractPreviewAddresses(source);
    const config = this.extractConfigLike(source);
    const { derivationScheme, accountKeyPath, masterFingerprint } = this.extractConfigMetadata(config);
    const { currency, cryptoCode } = this.extractCurrencyMetadata(source, fallbackCurrency);

    return {
      storeId,
      currency,
      cryptoCode,
      paymentMethodId,
      derivationScheme,
      accountKeyPath,
      masterFingerprint,
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
    let cryptoCode = fallbackCurrency;
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
      const { currency: recordCurrency, cryptoCode: recordCryptoCode } = this.extractCurrencyMetadata(
        record,
        fallbackCurrency
      );
      currency = recordCurrency;
      cryptoCode = recordCryptoCode;
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
    const finalCurrency = this.extractCurrencyMetadata(payload, currency);
    currency = finalCurrency.currency;
    cryptoCode = finalCurrency.cryptoCode || cryptoCode;

    return {
      storeId,
      currency,
      cryptoCode,
      paymentMethodId,
      enabled,
      derivationScheme,
      accountKeyPath,
      masterFingerprint,
      label: label ?? derivedLabel
    } satisfies OnchainPaymentMethodConfig;
  }

  private extractPreviewAddresses(source: unknown): OnchainPreviewAddressItem[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    const record = source as Record<string, unknown>;
    const candidates: unknown[] = [];

    if (Array.isArray(record.addresses)) {
      candidates.push(...record.addresses);
    }
    if (Array.isArray(record.addressPreview)) {
      candidates.push(...record.addressPreview);
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

  private extractConfigLike(source: unknown): unknown {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const record = source as Record<string, unknown>;
    if (record.config !== undefined) {
      return record.config;
    }
    if (record.paymentMethod && typeof record.paymentMethod === 'object') {
      const pm = record.paymentMethod as Record<string, unknown>;
      if (pm.config !== undefined) {
        return pm.config;
      }
    }
    return source;
  }

  private extractCurrencyMetadata(source: unknown, fallback: string): { currency: string; cryptoCode: string } {
    let currency = fallback;
    let cryptoCode = fallback;

    if (!source || typeof source !== 'object') {
      return { currency, cryptoCode };
    }

    const record = source as Record<string, unknown>;
    const directCurrency = this.firstString([record.currency]);
    const directCrypto = this.firstString([record.cryptoCode]);

    if (directCurrency) {
      currency = directCurrency.toUpperCase();
    }
    if (directCrypto) {
      cryptoCode = directCrypto.toUpperCase();
    } else if (directCurrency) {
      cryptoCode = directCurrency.toUpperCase();
    }

    if (record.paymentMethod && typeof record.paymentMethod === 'object') {
      const paymentMethod = record.paymentMethod as Record<string, unknown>;
      const nestedCurrency = this.firstString([paymentMethod.currency]);
      const nestedCrypto = this.firstString([paymentMethod.cryptoCode]);
      if (nestedCurrency && currency === fallback) {
        currency = nestedCurrency.toUpperCase();
      }
      if (nestedCrypto && cryptoCode === fallback) {
        cryptoCode = nestedCrypto.toUpperCase();
      }
      if (!nestedCrypto && nestedCurrency && cryptoCode === fallback) {
        cryptoCode = nestedCurrency.toUpperCase();
      }
    }

    return { currency, cryptoCode };
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

  private shouldAttemptFallback(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return status === 404 || status === 405 || status === 415;
    }
    return false;
  }

  private async prepareStoreContext(
    storeId: string,
    options?: PaymentMethodRequestOptions
  ): Promise<StoreContext> {
    const store = options?.store ?? (await this.lookupStore(storeId));
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const apiKey = this.decryptStoreApiKey(store);
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

  private buildPaymentMethodId(currency: string): string {
    return `${currency.toUpperCase()}-CHAIN`;
  }

  private buildModernPreviewPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet/preview`;
  }

  private buildLegacyPreviewPath(storeId: string, currency: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/OnChain/${encodeURIComponent(currency.toUpperCase())}/preview`;
  }

  private buildModernPaymentMethodPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`;
  }

  private buildLegacyPaymentMethodPath(storeId: string, currency: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/OnChain/${encodeURIComponent(currency.toUpperCase())}`;
  }

  private handleBtcpayError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const message = this.extractErrorMessage(error);
      if ([400, 409, 422].includes(status)) {
        throw new UnprocessableEntityException(message, { cause: error as Error });
      }
      if (status === 401 || status === 403) {
        throw new UnauthorizedException('BTCPay authentication failed', { cause: error as Error });
      }
      throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
    }

    if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
      throw error;
    }

    throw new BadGatewayException('BTCPay request failed', { cause: error instanceof Error ? error : undefined });
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
