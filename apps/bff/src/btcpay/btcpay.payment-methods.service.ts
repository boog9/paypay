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
  cryptoCode: string;
  paymentMethodId: string;
  derivationScheme: string | null;
  accountKeyPath: string | null;
  masterFingerprint: string | null;
  addresses: OnchainPreviewAddressItem[];
}

export interface OnchainPaymentMethodConfig {
  storeId: string;
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

  async previewOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    body?: OnchainPreviewRequest,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPreviewResponse> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = this.buildPaymentMethodId(cryptoCode);
    const params = {
      offset: String(body?.offset ?? 0),
      amount: String(body?.amount ?? 10)
    };
    const payload = this.buildPreviewRequestBody(body);

    try {
      const response = await context.http.post(
        this.buildModernPreviewPath(context.store.btcpayStoreId, paymentMethodId),
        payload,
        { params }
      );
      return this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        cryptoCode,
        paymentMethodId
      );
    } catch (error) {
      if (this.shouldAttemptFallback(error)) {
        return this.previewOnchainLegacy(context, cryptoCode, paymentMethodId, body);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to preview on-chain payment method.');
  }

  async getOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    options?: PaymentMethodRequestOptions & { includeConfig?: boolean }
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = this.buildPaymentMethodId(cryptoCode);
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
        cryptoCode,
        paymentMethodId
      );
    } catch (error) {
      if (this.shouldAttemptFallback(error)) {
        return this.getOnchainLegacy(context, cryptoCode, paymentMethodId, options?.includeConfig !== false);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to retrieve on-chain payment method.');
  }

  async updateOnchain(
    storeId: string,
    cryptoCode = 'BTC',
    payload: UpdateOnchainPaymentMethodPayload,
    options?: PaymentMethodRequestOptions
  ): Promise<OnchainPaymentMethodConfig> {
    const context = await this.prepareStoreContext(storeId, options);
    const paymentMethodId = this.buildPaymentMethodId(cryptoCode);
    const requestBody = this.buildUpdateRequestBody(payload);

    try {
      const response = await context.http.put(
        this.buildModernPaymentMethodPath(context.store.btcpayStoreId, paymentMethodId),
        requestBody
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        cryptoCode,
        paymentMethodId
      );
    } catch (error) {
      if (this.shouldAttemptFallback(error)) {
        return this.updateOnchainLegacy(context, cryptoCode, payload, paymentMethodId);
      }
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to update on-chain payment method.');
  }

  private async previewOnchainLegacy(
    context: StoreContext,
    cryptoCode: string,
    paymentMethodId: string,
    body?: OnchainPreviewRequest
  ): Promise<OnchainPreviewResponse> {
    try {
      const response = await context.http.post(
        this.buildLegacyPreviewPath(context.store.btcpayStoreId, cryptoCode),
        this.buildLegacyPreviewBody(body)
      );
      return this.normalizePreviewResponse(
        response.data,
        context.store.btcpayStoreId,
        cryptoCode,
        paymentMethodId
      );
    } catch (fallbackError) {
      this.handleBtcpayError(fallbackError);
      throw new InternalServerErrorException('Failed to preview on-chain payment method.');
    }
  }

  private async getOnchainLegacy(
    context: StoreContext,
    cryptoCode: string,
    paymentMethodId: string,
    includeConfig: boolean
  ): Promise<OnchainPaymentMethodConfig> {
    try {
      const response = await context.http.get(
        this.buildLegacyPaymentMethodPath(context.store.btcpayStoreId, cryptoCode),
        includeConfig ? undefined : { params: { includeConfig: 'false' } }
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        cryptoCode,
        paymentMethodId
      );
    } catch (fallbackError) {
      this.handleBtcpayError(fallbackError);
      throw new InternalServerErrorException('Failed to retrieve on-chain payment method.');
    }
  }

  private async updateOnchainLegacy(
    context: StoreContext,
    cryptoCode: string,
    payload: UpdateOnchainPaymentMethodPayload,
    paymentMethodId: string
  ): Promise<OnchainPaymentMethodConfig> {
    try {
      const response = await context.http.put(
        this.buildLegacyPaymentMethodPath(context.store.btcpayStoreId, cryptoCode),
        this.buildLegacyUpdateBody(payload)
      );
      return this.normalizePaymentMethodResponse(
        response.data,
        context.store.btcpayStoreId,
        cryptoCode,
        paymentMethodId
      );
    } catch (fallbackError) {
      this.handleBtcpayError(fallbackError);
      throw new InternalServerErrorException('Failed to update on-chain payment method.');
    }
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

  private buildLegacyPreviewBody(body?: OnchainPreviewRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
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
    cryptoCode: string,
    paymentMethodId: string
  ): OnchainPreviewResponse {
    const addresses = this.extractPreviewAddresses(source);
    const config = this.extractConfigLike(source);
    const { derivationScheme, accountKeyPath, masterFingerprint } = this.extractConfigMetadata(config);

    return {
      storeId,
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
    cryptoCode: string,
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

    const { derivationScheme, accountKeyPath, masterFingerprint, label: derivedLabel } =
      this.extractConfigMetadata(configPayload);

    return {
      storeId,
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
      return status === 404 || status === 405;
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

  private buildPaymentMethodId(cryptoCode: string): string {
    return `${cryptoCode.toUpperCase()}-CHAIN`;
  }

  private buildModernPreviewPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet/preview`;
  }

  private buildLegacyPreviewPath(storeId: string, cryptoCode: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/OnChain/${encodeURIComponent(cryptoCode.toUpperCase())}/preview`;
  }

  private buildModernPaymentMethodPath(storeId: string, paymentMethodId: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`;
  }

  private buildLegacyPaymentMethodPath(storeId: string, cryptoCode: string): string {
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/OnChain/${encodeURIComponent(cryptoCode.toUpperCase())}`;
  }

  private handleBtcpayError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const message = this.extractErrorMessage(error);
      if (status >= 400 && status < 500) {
        throw new UnprocessableEntityException(message, { cause: error as Error });
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
    return this.rewriteValidationMessage('Invalid derivation scheme. Provide a valid xpub/ypub/zpub or NBX expression such as wpkh([FPR/84\'/0\'/0\']xpub.../0/*).');
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
      return 'Invalid derivation scheme. Provide a valid xpub/ypub/zpub or NBX expression such as wpkh([FPR/84\'/0\'/0\']xpub.../0/*).';
    }
    if (/derivation/i.test(normalized)) {
      return normalized;
    }
    if (/mnemonic|seed|xprv|yprv|zprv/i.test(normalized)) {
      return 'Seeds or private keys must never be uploaded. Provide an xpub/ypub/zpub or NBX expression only.';
    }
    return normalized;
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
