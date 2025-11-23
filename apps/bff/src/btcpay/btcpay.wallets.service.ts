import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ManagedStoreEntity } from '../stores/managed-store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { BtcpayService } from './btcpay.service';
import { normalizePaymentMethodId } from './btcpay.payment-methods.service';
import { isUuid } from '../shared/is-uuid';

interface WalletRequestOptions {
  store?: ManagedStoreEntity;
  apiKeyOverride?: string | null;
  host?: string | null;
}

export interface ListTransactionsQuery {
  skip?: number;
  count?: number;
  labels?: string[];
  order?: 'asc' | 'desc';
}

export interface ListTransactionsResult {
  total?: number;
  items: unknown[];
}

interface StoreContext {
  store: ManagedStoreEntity;
  apiKey: string;
  baseUrl: string;
  http: AxiosInstance;
  cleanup: () => void;
}

@Injectable()
export class BtcpayWalletService {
  private readonly logger = new Logger(BtcpayWalletService.name);

  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly btcpayService: BtcpayService
  ) {}

  async listTransactions(
    storeId: string,
    cryptoCode: string,
    query: ListTransactionsQuery | undefined,
    options?: WalletRequestOptions
  ): Promise<ListTransactionsResult> {
    const context = await this.prepareStoreContext(storeId, options);
    const params = this.buildTransactionsQuery(query);

    try {
      const response = await context.http.get(
        this.buildTransactionsPath(context.store.btcpayStoreId, cryptoCode),
        params ? { params } : undefined
      );
      return this.normalizeTransactionsResponse(response.data);
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to list on-chain wallet transactions.');
  }

  async getTransaction(
    storeId: string,
    cryptoCode: string,
    transactionId: string,
    options?: WalletRequestOptions
  ): Promise<unknown> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const response = await context.http.get(
        this.buildTransactionPath(context.store.btcpayStoreId, cryptoCode, transactionId)
      );
      return response.data;
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to load on-chain wallet transaction.');
  }

  async getOverview(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<unknown> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const response = await context.http.get(
        this.buildWalletBasePath(context.store.btcpayStoreId, cryptoCode)
      );
      return response.data;
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to load on-chain wallet overview.');
  }

  /**
   * Checks BTCPay's `/wallet` endpoint to determine whether an on-chain wallet exists.
   *
   * BTCPay returns HTTP 200 with the wallet payload when a wallet is present and
   * HTTP 404 when the payment method has no associated wallet yet. Any other
   * status code (401/403/5xx) indicates an upstream error and is rethrown using
   * the standard BTCPay error mapper.
   */
  async getOnchainWalletOverview(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<{ hasWallet: boolean; raw?: unknown }> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const response = await context.http.get(
        this.buildWalletBasePath(context.store.btcpayStoreId, cryptoCode)
      );
      return { hasWallet: true, raw: response.data };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          return { hasWallet: false };
        }
      }

      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to check on-chain wallet presence.');
  }

  async getBitcoinWalletPresence(
    storeId: string,
    options?: WalletRequestOptions
  ): Promise<{ hasWallet: boolean }> {
    const overview = await this.getOnchainWalletOverview(storeId, 'BTC', options);
    return { hasWallet: overview.hasWallet };
  }

  async listUtxos(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<unknown[]> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const response = await context.http.get(
        this.buildUtxoPath(context.store.btcpayStoreId, cryptoCode)
      );
      if (this.isUnknownArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to list on-chain wallet UTXOs.');
  }

  async getReceiveAddress(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<unknown> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const response = await context.http.get(
        this.buildAddressPath(context.store.btcpayStoreId, cryptoCode)
      );
      return response.data;
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to load on-chain receive address.');
  }

  /**
   * Prunes historical transactions without affecting current wallet state.
   * Operation: StoreOnChainWallets_PruneOnChainWalletTransactions
   */
  async pruneWalletTransactions(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<void> {
    const context = await this.prepareStoreContext(storeId, options);
    const path = `${this.buildWalletBasePath(context.store.btcpayStoreId, cryptoCode)}/transactions/prune`;

    try {
      await context.http.post(path);
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }
  }

  /**
   * Clears on-chain wallet transaction history.
   * Operation: StoreOnChainWallets_DeleteOnChainWalletTransactions
   */
  async clearWalletTransactions(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<void> {
    const context = await this.prepareStoreContext(storeId, options);
    const path = `${this.buildWalletBasePath(context.store.btcpayStoreId, cryptoCode)}/transactions`;

    try {
      await context.http.delete(path);
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }
  }

  /**
   * Removes the on-chain wallet configuration so a new watch-only wallet can be attached.
   * Operation: StoreOnChainWallets_DeleteOnChainWallet
   */
  async replaceWallet(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<void> {
    await this.removeWallet(storeId, cryptoCode, options);
  }

  /**
   * Removes the on-chain wallet configuration from BTCPay.
   * Operation: StoreOnChainWallets_DeleteOnChainWallet
   * Endpoint: DELETE /api/v1/stores/{storeId}/payment-methods/{paymentMethodId}
   */
  async removeWallet(
    storeId: string,
    cryptoCode: string,
    options?: WalletRequestOptions
  ): Promise<void> {
    const context = await this.prepareStoreContext(storeId, options);
    const path = this.buildPaymentMethodPath(context.store.btcpayStoreId, cryptoCode);

    try {
      await context.http.delete(path);
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }
  }

  async getFeeRate(
    storeId: string,
    cryptoCode: string,
    blockTarget: number | undefined,
    options?: WalletRequestOptions
  ): Promise<unknown> {
    const context = await this.prepareStoreContext(storeId, options);

    try {
      const params = this.buildFeeRateQuery(blockTarget);
      const response = await context.http.get(
        this.buildFeeRatePath(context.store.btcpayStoreId, cryptoCode),
        params ? { params } : undefined
      );
      return response.data;
    } catch (error) {
      this.handleBtcpayError(error);
    } finally {
      context.cleanup();
    }

    throw new InternalServerErrorException('Failed to load on-chain fee rate.');
  }

  private buildTransactionsQuery(query: ListTransactionsQuery | undefined):
    | Record<string, string | number>
    | undefined {
    if (!query) {
      return undefined;
    }

    const params: Record<string, string | number> = {};
    if (typeof query.skip === 'number' && Number.isFinite(query.skip) && query.skip > 0) {
      params.skip = Math.max(0, Math.trunc(query.skip));
    }

    if (typeof query.count === 'number' && Number.isFinite(query.count) && query.count > 0) {
      params.take = Math.max(1, Math.trunc(query.count));
    }

    const labelFilter = this.normalizeLabelFilter(query.labels);
    if (labelFilter) {
      params.labelFilter = labelFilter;
    }

    if (query.order === 'asc' || query.order === 'desc') {
      params.order = query.order;
    }

    return Object.keys(params).length > 0 ? params : undefined;
  }

  private normalizeLabelFilter(labels: string[] | undefined): string | null {
    if (!Array.isArray(labels) || labels.length === 0) {
      return null;
    }

    for (const entry of labels) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return null;
  }

  private buildFeeRateQuery(blockTarget: number | undefined):
    | Record<string, number>
    | undefined {
    if (typeof blockTarget !== 'number' || !Number.isFinite(blockTarget)) {
      return undefined;
    }

    const normalized = Math.max(1, Math.trunc(blockTarget));
    return { blockTarget: normalized };
  }

  private normalizeTransactionsResponse(payload: unknown): ListTransactionsResult {
    if (!payload) {
      return { items: [] };
    }

    if (Array.isArray(payload)) {
      return { items: payload };
    }

    if (typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      const items = this.extractTransactionsArray(record);
      const total = this.extractTotal(record.total ?? record.count);
      return { items, total: total ?? undefined };
    }

    return { items: [] };
  }

  private extractTransactionsArray(record: Record<string, unknown>): unknown[] {
    const candidates: unknown[][] = [];
    if (this.isUnknownArray(record.items)) {
      candidates.push(record.items);
    }
    if (this.isUnknownArray(record.transactions)) {
      candidates.push(record.transactions);
    }
    if (candidates.length === 0 && this.isUnknownArray(record.data)) {
      candidates.push(record.data);
    }

    const candidate = candidates.find((entry) => entry.length >= 0);
    return candidate ?? [];
  }

  private isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  private extractTotal(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
      }
    }
    return null;
  }

  private handleBtcpayError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;

      this.logger.debug(
        {
          status,
          path: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          code: this.extractErrorCode(error.response?.data),
          message: this.extractErrorMessage(error.response?.data)
        },
        'btcpay.wallets.error'
      );

      if (this.isWalletNotFoundError(error, status)) {
        throw new NotFoundException('On-chain wallet not found or not configured in BTCPay.', {
          cause: error as Error
        });
      }

      const message = this.resolveErrorMessage(error);

      switch (status) {
        case 400:
          throw new BadRequestException(message, { cause: error as Error });
        case 401:
          throw new UnauthorizedException(message, { cause: error as Error });
        case 403:
          throw new ForbiddenException(message, { cause: error as Error });
        case 404:
          throw new NotFoundException(message, { cause: error as Error });
        case 422:
          throw new UnprocessableEntityException(message, { cause: error as Error });
        default:
          if (status >= 400 && status < 500) {
            throw new BadRequestException(message, { cause: error as Error });
          }
          throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }
    }

    throw new InternalServerErrorException('Unexpected BTCPay error', {
      cause: error instanceof Error ? error : undefined
    });
  }

  private resolveErrorMessage(error: AxiosError): string {
    const message = this.extractErrorMessage(error.response?.data);
    if (message) {
      return message;
    }

    return 'BTCPay request failed';
  }

  private extractErrorCode(payload: unknown): string | undefined {
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      const code = record.code;
      if (typeof code === 'string') {
        const trimmed = code.trim();
        if (trimmed) {
          return this.truncate(trimmed, 64);
        }
      }
    }

    return undefined;
  }

  private extractErrorMessage(payload: unknown): string | undefined {
    if (!payload) {
      return undefined;
    }

    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      return trimmed ? this.truncate(trimmed, 256) : undefined;
    }

    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      const message = record.message;
      if (typeof message === 'string' && message.trim()) {
        return this.truncate(message.trim(), 256);
      }
    }

    return undefined;
  }

  private isWalletNotFoundError(error: AxiosError, status: number): boolean {
    if (status !== 404) {
      return false;
    }

    const path = error.config?.url ?? '';
    if (path && !path.includes('/wallet')) {
      return false;
    }

    const code = this.extractErrorCode(error.response?.data);
    if (code && this.isWalletMissingCode(code)) {
      return true;
    }

    const message = this.extractErrorMessage(error.response?.data);
    return message ? this.isWalletMissingCode(message) : false;
  }

  private isWalletMissingCode(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      normalized === 'wallet-not-found' ||
      (normalized.includes('wallet') && normalized.includes('not') && normalized.includes('found'))
    );
  }

  private async prepareStoreContext(
    storeId: string,
    options?: WalletRequestOptions
  ): Promise<StoreContext> {
    const store = options?.store ?? (await this.lookupStore(storeId));
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const apiKey = this.normalizeApiKey(options?.apiKeyOverride) ?? this.decryptStoreApiKey(store);
    const baseUrl = this.resolveBaseUrl(store, options?.host);
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
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private resolveBaseUrl(store: ManagedStoreEntity, hostOverride?: string | null): string {
    const override = typeof hostOverride === 'string' && hostOverride.trim() ? hostOverride.trim() : undefined;
    const host = override ?? (store.btcpayHost && store.btcpayHost.trim() ? store.btcpayHost.trim() : undefined);
    return this.btcpayService.resolveBaseUrl(host);
  }

  private decryptStoreApiKey(store: ManagedStoreEntity): string {
    try {
      return this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
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
      return null;
    }

    const where: FindOptionsWhere<ManagedStoreEntity>[] = isUuid(trimmed)
      ? [{ id: trimmed }, { btcpayStoreId: trimmed }]
      : [{ btcpayStoreId: trimmed }];

    const store = await this.storesRepository.findOne({ where });
    return store ?? null;
  }

  private buildWalletBasePath(storeId: string, cryptoCode: string): string {
    const normalizedCode = this.normalizeCryptoCode(cryptoCode);
    const paymentMethodId = normalizePaymentMethodId(normalizedCode, 'chain');
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}/wallet`;
  }

  private buildPaymentMethodPath(storeId: string, cryptoCode: string): string {
    const normalizedCode = this.normalizeCryptoCode(cryptoCode);
    const paymentMethodId = normalizePaymentMethodId(normalizedCode, 'chain');
    return `/api/v1/stores/${encodeURIComponent(storeId)}/payment-methods/${encodeURIComponent(paymentMethodId)}`;
  }

  private buildTransactionsPath(storeId: string, cryptoCode: string): string {
    return `${this.buildWalletBasePath(storeId, cryptoCode)}/transactions`;
  }

  private buildTransactionPath(storeId: string, cryptoCode: string, transactionId: string): string {
    return `${this.buildTransactionsPath(storeId, cryptoCode)}/${encodeURIComponent(transactionId)}`;
  }

  private buildUtxoPath(storeId: string, cryptoCode: string): string {
    return `${this.buildWalletBasePath(storeId, cryptoCode)}/utxos`;
  }

  private buildAddressPath(storeId: string, cryptoCode: string): string {
    return `${this.buildWalletBasePath(storeId, cryptoCode)}/address`;
  }

  private buildFeeRatePath(storeId: string, cryptoCode: string): string {
    return `${this.buildWalletBasePath(storeId, cryptoCode)}/feerate`;
  }

  private normalizeCryptoCode(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      return 'BTC';
    }
    return trimmed.toUpperCase();
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, Math.max(0, maxLength));
  }

  private clearBuffer(value: string | null | undefined): void {
    if (!value) {
      return;
    }

    try {
      const buffer = Buffer.from(value, 'utf8');
      buffer.fill(0);
    } catch {
      // best effort cleanup only
    }
  }

  private normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.trunc(value));
  }

  private normalizePositiveInt(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(1, Math.trunc(value));
  }
}
