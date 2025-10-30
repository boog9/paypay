import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BTCPAY_CONFIG, type BtcpayRuntimeConfig } from './btcpay.tokens';
import {
  BTCPAY_INVOICE_WEBHOOK_EVENTS,
  BTCPAY_MINIMAL_PERMISSIONS,
  BTCPAY_STORE_BOOTSTRAP_PERMISSION
} from './btcpay.constants';
import { StoreEntity } from '../tenants/entities/store.entity';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';

export interface CreateInvoiceRequest {
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

interface ApiKeyResponse {
  apiKey: string;
  permissions: string[];
  id?: string;
}

interface WebhookResponse {
  id: string;
  secret?: string | null;
}

interface StoreResponse {
  id: string;
  name?: string;
  website?: string | null;
  defaultCurrency?: string | null;
}

interface CurrentApiKeyResponse {
  label?: string;
  permissions?: string[];
}

interface ApiKeyDetails {
  label?: string;
  permissions: string[];
}

interface InvoiceResponse {
  id: string;
  checkoutLink?: string | null;
  status?: string;
}

interface UserResponse {
  id: string;
  email: string;
}

interface BtcpayRequestContext {
  action?: string;
  correlationId?: string;
}

export interface IssueUserApiKeyOptions {
  label?: string;
  correlationId?: string;
}

export interface BtcpayServerInfoResponse {
  isTestnet?: boolean;
  networkType?: string | null;
  network?: string | null;
}

export interface BtcpayProxyOptions {
  storeId: string;
  method: string;
  path: string;
  data?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string | number | boolean | null | undefined>;
  requestId?: string;
}

@Injectable()
export class BtcpayService {
  private readonly logger = new Logger(BtcpayService.name, { timestamp: false });

  constructor(
    @Inject(BTCPAY_CONFIG) private readonly config: BtcpayRuntimeConfig,
    @InjectRepository(StoreEntity) private readonly storesRepository: Repository<StoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService
  ) {}

  private redactToken(value: string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.length > 4 ? `****${trimmed.slice(-4)}` : '****';
  }

  private summariseErrorPayload(payload: unknown): unknown {
    if (!payload) {
      return undefined;
    }
    if (typeof payload === 'string') {
      return payload.slice(0, 200);
    }
    if (Array.isArray(payload)) {
      const entries = payload as unknown[];
      return entries.slice(0, 5).map((entry) => {
        if (entry && typeof entry === 'object') {
          const item = entry as Record<string, unknown>;
          const result: Record<string, unknown> = {};
          if (typeof item.path === 'string') {
            result.path = item.path;
          }
          if (typeof item.message === 'string') {
            result.message = item.message;
          }
          if (typeof item.code === 'string') {
            result.code = item.code;
          }
          return result;
        }
        return entry;
      });
    }
    if (typeof payload === 'object') {
      const source = payload as Record<string, unknown>;
      const allowedKeys = ['code', 'error', 'message', 'errors', 'detail'];
      const filtered = allowedKeys.reduce<Record<string, unknown>>((acc, key) => {
        if (key in source) {
          acc[key] = source[key];
        }
        return acc;
      }, {});
      return Object.keys(filtered).length > 0 ? filtered : undefined;
    }
    return undefined;
  }

  private isUsernameTakenError(error: AxiosError<unknown>): boolean {
    if (error.response?.status !== 422) {
      return false;
    }
    const data = error.response?.data;
    if (!Array.isArray(data)) {
      return false;
    }
    return data.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const record = entry as Record<string, unknown>;
      const path = typeof record.path === 'string' ? record.path : '';
      const message = typeof record.message === 'string' ? record.message : '';
      return path.toLowerCase() === 'email' && /already taken/i.test(message);
    });
  }

  private isMissingApiKeyError(status: number | undefined, payload: unknown): boolean {
    if (!status || (status !== 400 && status !== 404)) {
      return false;
    }
    if (!payload) {
      return false;
    }
    const text =
      typeof payload === 'string'
        ? payload
        : (() => {
            try {
              return JSON.stringify(payload);
            } catch {
              return '';
            }
          })();
    if (!text) {
      return false;
    }
    return /apikey/i.test(text) && /does not exist/i.test(text);
  }

  private normaliseBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private getBaseUrl(host?: string): string {
    return this.normaliseBaseUrl(host ?? this.config.baseUrl);
  }

  resolveBaseUrl(host?: string): string {
    return this.getBaseUrl(host);
  }

  async proxy<T = unknown>(options: BtcpayProxyOptions): Promise<T> {
    const { store, apiKey } = await this.resolveStoreForProxy(options.storeId);
    const requestId = typeof options.requestId === 'string' ? options.requestId.trim() : '';
    const normalizedRequestId = requestId.length > 0 ? requestId : undefined;
    const path = this.ensureAbsolutePath(options.path);
    const headers: Record<string, string> = {
      Authorization: `token ${apiKey}`
    };

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        if (value === undefined || value === null) {
          continue;
        }
        headers[key] = String(value);
      }
    }

    const http = this.createHttp(store.btcpayHost, headers);

    try {
      const response = await http.request<T>({
        url: path,
        method: options.method,
        data: options.data,
        params: options.params,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const statusCode = error.response.status ?? 502;
        const payload = error.response.data ?? null;
        const logPayload: Record<string, unknown> = {
          storeId: store.btcpayStoreId,
          path,
          statusCode,
        };
        if (normalizedRequestId) {
          logPayload.requestId = normalizedRequestId;
        }
        this.logger.warn(logPayload, 'btcpay.proxy');
        throw new HttpException(payload, statusCode, {
          cause: error instanceof Error ? error : undefined,
        });
      }

      return this.maskError(error, {
        action: 'proxy',
        correlationId: normalizedRequestId,
      });
    }
  }

  private createHttp(baseUrl: string, headers: Record<string, string>): AxiosInstance {
    return axios.create({
      baseURL: this.getBaseUrl(baseUrl),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'PayPay-BFF/1.0',
        ...headers
      },
      timeout: 10_000,
      maxBodyLength: 2 * 1024 * 1024,
      maxContentLength: 2 * 1024 * 1024
    });
  }

  private maskError(error: unknown, context?: BtcpayRequestContext): never {
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError<{ message?: string; errors?: unknown }>;
      const code = err.response?.status ?? 500;
      const body = err.response?.data as { message?: string } | undefined;
      const message =
        body?.message && typeof body.message === 'string' ? body.message : 'BTCPay request failed';
      const logPayload: Record<string, unknown> = {
        statusCode: code,
        message,
      };
      if (context?.correlationId) {
        logPayload.correlationId = context.correlationId;
      }
      const summary = this.summariseErrorPayload(err.response?.data);
      if (summary) {
        logPayload.error = summary;
      }
      this.logger.error(logPayload, context?.action ?? 'BTCPay request failed');
      switch (code) {
        case 400:
          throw new BadRequestException(message, { cause: error as Error });
        case 401:
          throw new UnauthorizedException(message, { cause: error as Error });
        case 403:
          throw new ForbiddenException(message, { cause: error as Error });
        case 404:
          throw new NotFoundException(message, { cause: error as Error });
        case 409:
          throw new ConflictException(message, { cause: error as Error });
        default:
          throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }
    }
    throw new InternalServerErrorException('Unexpected BTCPay error', { cause: error as Error });
  }

  async createUser(
    host: string | undefined,
    payload: {
      email: string;
      password?: string;
      name?: string;
      sendInvitationEmail?: boolean;
      correlationId?: string;
    }
  ): Promise<UserResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const body: Record<string, unknown> = {
        email: payload.email,
        name: payload.name,
        sendInvitationEmail: payload.sendInvitationEmail ?? false
      };
      if (payload.password) {
        body.password = payload.password;
      }
      const { data } = await http.post<UserResponse>('/api/v1/users', body);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && this.isUsernameTakenError(error)) {
        throw new ConflictException('BTCPay user already exists', { cause: error as Error });
      }
      return this.maskError(error, { action: 'createUser', correlationId: payload.correlationId });
    }
  }

  async createUserApiKey(
    host: string | undefined,
    idOrEmail: string,
    storeId: string,
    options?: { correlationId?: string }
  ): Promise<ApiKeyResponse> {
    return this.issueUserApiKey(host, idOrEmail, this.buildStorePermissions(storeId), {
      label: `Store ${storeId} key`,
      correlationId: options?.correlationId,
    });
  }

  async createUserApiKeyUnscoped(
    host: string | undefined,
    idOrEmail: string,
    permissions: string[],
    options?: { label?: string; correlationId?: string }
  ): Promise<ApiKeyResponse> {
    return this.issueUserApiKey(host, idOrEmail, permissions, {
      label: options?.label ?? 'Temporary key',
      correlationId: options?.correlationId,
    });
  }

  async issueUserApiKey(
    host: string | undefined,
    idOrEmail: string,
    permissions: string[],
    options?: IssueUserApiKeyOptions
  ): Promise<ApiKeyResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const response = await http.post<ApiKeyResponse & { label?: string; permissions?: unknown[] }>(
        `/api/v1/users/${encodeURIComponent(idOrEmail)}/api-keys`,
        {
          label: options?.label ?? 'PayPay managed key',
          permissions
        }
      );
      const data = response.data;
      if (!data?.apiKey || typeof data.apiKey !== 'string') {
        throw new InternalServerErrorException('BTCPay did not return an API key');
      }
      const grantedPermissions = Array.isArray(data.permissions)
        ? (data.permissions ?? []).filter((permission): permission is string => typeof permission === 'string')
        : [];
      return {
        apiKey: data.apiKey,
        permissions: grantedPermissions,
        id: typeof data.id === 'string' ? data.id : undefined
      } satisfies ApiKeyResponse;
    } catch (error) {
      return this.maskError(error, {
        action: 'issueUserApiKey',
        correlationId: options?.correlationId,
      });
    }
  }

  async issueUserApiKeyWithPermissions(
    idOrEmail: string,
    permissions: string[],
    label = 'portal-bootstrap'
  ): Promise<{ apiKey: string }> {
    const response = await this.issueUserApiKey(undefined, idOrEmail, permissions, { label });
    return { apiKey: response.apiKey };
  }

  async createStoreUsingUserKey(
    userApiKey: string,
    dto: { name: string; defaultCurrency?: string }
  ): Promise<StoreResponse> {
    return this.createStoreWithUserToken(undefined, userApiKey, dto);
  }

  async issueStoreScopedApiKey(
    idOrEmail: string,
    storeId: string,
    label: string,
    permissions: string[]
  ): Promise<{ apiKey: string }> {
    const response = await this.issueUserApiKey(undefined, idOrEmail, permissions, { label });
    return { apiKey: response.apiKey };
  }

  async createStoreWithUserToken(
    host: string | undefined,
    apiKey: string,
    payload: { name: string; website?: string; defaultCurrency?: string; preferredExchange?: string },
    context?: BtcpayRequestContext
  ): Promise<StoreResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const body: Record<string, string> = { name: payload.name };
      if (payload.website) {
        body.website = payload.website;
      }
      if (payload.defaultCurrency) {
        body.defaultCurrency = payload.defaultCurrency;
      }
      if (payload.preferredExchange) {
        body.preferredExchange = payload.preferredExchange;
      }
      const { data } = await http.post<StoreResponse>('/api/v1/stores', body);
      return data;
    } catch (error) {
      return this.maskError(error, { action: 'createStoreWithUserToken', ...context });
    }
  }

  async setCoinGeckoAsDefaultRateSource(host: string | undefined, apiKey: string, storeId: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      await http.put(`/api/v1/stores/${storeId}/rates/configuration`, {
        preferredSource: 'CoinGecko',
        rateSource: 'CoinGecko'
      });
    } catch (error) {
      return this.maskError(error);
    }
  }

  async listStores(host: string | undefined, apiKey: string): Promise<StoreResponse[]> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.get<StoreResponse[]>('/api/v1/stores');
      if (!Array.isArray(data)) {
        return [];
      }
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async getCurrentApiKey(host: string | undefined, apiKey: string): Promise<ApiKeyDetails> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.get<CurrentApiKeyResponse>('/api/v1/api-keys/current');
      const rawPermissions = Array.isArray(data?.permissions) ? data.permissions ?? [] : [];
      const permissions = rawPermissions.filter((permission): permission is string => typeof permission === 'string');
      return {
        label: typeof data?.label === 'string' ? data.label : undefined,
        permissions
      } satisfies ApiKeyDetails;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async deleteApiKey(host: string | undefined, apiKey: string): Promise<void> {
    await this.revokeUserApiKey(host, apiKey);
  }

  async revokeUserApiKey(
    host: string | undefined,
    keyIdOrValue: string,
    context?: BtcpayRequestContext
  ): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      await http.delete(`/api/v1/api-keys/${encodeURIComponent(keyIdOrValue)}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data: unknown = error.response?.data;
        if (this.isMissingApiKeyError(status, data)) {
          const logPayload: Record<string, unknown> = {
            statusCode: status,
            key: this.redactToken(keyIdOrValue),
          };
          if (context?.correlationId) {
            logPayload.correlationId = context.correlationId;
          }
          if (data) {
            const summary = this.summariseErrorPayload(data);
            if (summary) {
              logPayload.error = summary;
            }
          }
          this.logger.warn(logPayload, 'revokeUserApiKey');
          return;
        }
      }
      this.maskError(error, { action: 'revokeUserApiKey', ...context });
    }
  }

  async deleteUserApiKeyForUser(host: string | undefined, email: string, apiKeyIdOrValue: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      await http.delete(
        `/api/v1/users/${encodeURIComponent(email)}/api-keys/${encodeURIComponent(apiKeyIdOrValue)}`
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data: unknown = error.response?.data;
        if (this.isMissingApiKeyError(status, data)) {
          this.logger.warn(
            {
              statusCode: status,
              key: this.redactToken(apiKeyIdOrValue),
              email
            },
            'deleteUserApiKeyForUser'
          );
          return;
        }
      }
      this.maskError(error, { action: 'deleteUserApiKeyForUser' });
    }
  }

  async removeStoreUser(host: string | undefined, storeId: string, idOrEmail: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      await http.delete(`/api/v1/stores/${storeId}/users/${encodeURIComponent(idOrEmail)}`);
    } catch (error) {
      this.maskError(error);
    }
  }

  async registerWebhook(
    host: string | undefined,
    apiKey: string,
    storeId: string,
    context?: BtcpayRequestContext
  ): Promise<WebhookResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.post<WebhookResponse>(`/api/v1/stores/${storeId}/webhooks`, {
        url: this.getWebhookUrl(),
        isActive: true,
        automaticRedelivery: true,
        authorizedEvents: {
          everything: false,
          specificEvents: [...BTCPAY_INVOICE_WEBHOOK_EVENTS]
        }
      });
      return data;
    } catch (error) {
      return this.maskError(error, { action: 'registerWebhook', ...context });
    }
  }

  async deleteWebhook(host: string | undefined, apiKey: string, storeId: string, webhookId: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      await http.delete(`/api/v1/stores/${storeId}/webhooks/${webhookId}`);
    } catch (error) {
      this.maskError(error);
    }
  }

  async deleteStore(host: string | undefined, apiKey: string, storeId: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      await http.delete(`/api/v1/stores/${storeId}`);
    } catch (error) {
      this.maskError(error);
    }
  }

  async probeStoreInvoices(host: string | undefined, apiKey: string, storeId: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      await http.get(`/api/v1/stores/${storeId}/invoices`, { params: { limit: 1 } });
    } catch (error) {
      this.maskError(error);
    }
  }

  async createInvoice(opts: {
    storeId: string;
    payload: CreateInvoiceRequest;
    apiKey?: string;
    host?: string;
  }): Promise<InvoiceResponse> {
    const host = opts.host ?? this.config.baseUrl;
    if (!host) {
      throw new InternalServerErrorException('BTCPay host is not configured');
    }

    const apiKey = opts.apiKey ?? (await this.getStoreApiKeySafe(opts.storeId));
    if (!apiKey) {
      throw new InternalServerErrorException('BTCPay API key for store is not available');
    }

    return this.doCreateInvoice(host, apiKey, opts.storeId, opts.payload);
  }

  private async getStoreApiKeySafe(storeId: string): Promise<string | undefined> {
    const store = await this.storesRepository.findOne({
      where: [{ btcpayStoreId: storeId }, { id: storeId }]
    });
    if (!store) {
      return undefined;
    }
    try {
      return this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
      const message = `Failed to decrypt BTCPay API key for store ${store.btcpayStoreId}`;
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(message);
      } else {
        const trace = error instanceof Error ? error.stack ?? error.message : undefined;
        this.logger.error(message, trace);
      }
      throw new InternalServerErrorException('Failed to decrypt BTCPay API key', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  private async doCreateInvoice(
    host: string,
    apiKey: string,
    storeId: string,
    payload: CreateInvoiceRequest
  ): Promise<InvoiceResponse> {
    const http = this.createHttp(host, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.post<InvoiceResponse>(`/api/v1/stores/${storeId}/invoices`, payload);
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async getStore(host: string | undefined, apiKey: string, storeId: string): Promise<StoreResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.get<StoreResponse>(`/api/v1/stores/${storeId}`);
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async healthProbe(): Promise<void> {
    const { healthApiKey, healthStoreId } = this.config;
    if (!healthApiKey || !healthStoreId) {
      return;
    }
    await this.getStore(undefined, healthApiKey, healthStoreId);
  }

  async getServerInfo(host?: string, context?: BtcpayRequestContext): Promise<BtcpayServerInfoResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const { data } = await http.get<BtcpayServerInfoResponse>('/api/v1/server/info');
      return data ?? {};
    } catch (error) {
      return this.maskError(error, { action: 'getServerInfo', ...context });
    }
  }

  private getAdminApiKey(): string {
    return this.config.adminApiKey;
  }

  private getWebhookUrl(): string {
    return this.config.webhookUrl;
  }

  buildAuthorizeUserUrl(params: { storeId: string; applicationName: string; redirectUrl: string; host?: string }): string {
    const baseUrl = new URL(this.getBaseUrl(params.host));
    const authorizeUrl = new URL('/api-keys/authorize', baseUrl);
    authorizeUrl.searchParams.set('applicationName', params.applicationName);
    authorizeUrl.searchParams.set('redirectUrl', params.redirectUrl);
    authorizeUrl.searchParams.set('storeId', params.storeId);
    authorizeUrl.searchParams.set('permissions', BTCPAY_MINIMAL_PERMISSIONS.join(','));
    return authorizeUrl.toString();
  }

  buildBootstrapPermissions(): string[] {
    return [BTCPAY_STORE_BOOTSTRAP_PERMISSION];
  }

  buildStorePermissions(storeId: string): string[] {
    return BTCPAY_MINIMAL_PERMISSIONS.map((permission) => `${permission}:${storeId}`);
  }

  private ensureAbsolutePath(path: string): string {
    const trimmed = typeof path === 'string' ? path.trim() : '';
    if (!trimmed) {
      throw new BadRequestException('Proxy path is required');
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  private async resolveStoreForProxy(storeId: string): Promise<{ store: StoreEntity; apiKey: string }> {
    const normalizedId = typeof storeId === 'string' ? storeId.trim() : '';
    if (!normalizedId) {
      throw new BadRequestException('Store identifier is required');
    }

    const store = await this.storesRepository.findOne({
      where: [
        { btcpayStoreId: normalizedId },
        { id: normalizedId },
      ],
    });

    if (!store) {
      throw new NotFoundException('Store not found or not managed by this portal');
    }

    let apiKey: string;
    try {
      apiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
      const logPayload: Record<string, unknown> = {
        storeId: store.btcpayStoreId,
      };
      this.logger.error(logPayload, 'btcpay.proxy.decryptFailed');
      throw new InternalServerErrorException('Failed to decrypt BTCPay API key', {
        cause: error instanceof Error ? error : undefined,
      });
    }

    if (!apiKey) {
      throw new InternalServerErrorException('BTCPay API key for store is not available');
    }

    return { store, apiKey };
  }
}
