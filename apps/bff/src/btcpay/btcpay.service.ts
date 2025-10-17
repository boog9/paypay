import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class BtcpayService {
  private readonly logger = new Logger(BtcpayService.name, { timestamp: false });

  constructor(
    @Inject(BTCPAY_CONFIG) private readonly config: BtcpayRuntimeConfig,
    @InjectRepository(StoreEntity) private readonly storesRepository: Repository<StoreEntity>,
    private readonly encryptionService: EnvelopeEncryptionService
  ) {}

  private normaliseBaseUrl(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }

  private getBaseUrl(host?: string): string {
    return this.normaliseBaseUrl(host ?? this.config.baseUrl);
  }

  resolveBaseUrl(host?: string): string {
    return this.getBaseUrl(host);
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

  private maskError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError<{ message?: string; errors?: unknown }>;
      const code = err.response?.status ?? 500;
      const body = err.response?.data as { message?: string } | undefined;
      const message = body?.message && typeof body.message === 'string' ? body.message : 'BTCPay request failed';
      this.logger.error({ statusCode: code, message }, 'BTCPay request failed');
      switch (code) {
        case 400:
          throw new BadRequestException(message, { cause: error as Error });
        case 401:
          throw new UnauthorizedException(message, { cause: error as Error });
        case 403:
          throw new ForbiddenException(message, { cause: error as Error });
        case 404:
          throw new NotFoundException(message, { cause: error as Error });
        default:
          throw new BadGatewayException('BTCPay request failed', { cause: error as Error });
      }
    }
    throw new InternalServerErrorException('Unexpected BTCPay error', { cause: error as Error });
  }

  async createUser(
    host: string | undefined,
    payload: { email: string; password?: string; name?: string; sendInvitationEmail?: boolean }
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
      return this.maskError(error);
    }
  }

  async createUserApiKey(host: string | undefined, email: string, storeId: string): Promise<ApiKeyResponse> {
    return this.issueUserApiKey(host, email, this.buildStorePermissions(storeId), {
      label: `Store ${storeId} key`
    });
  }

  async createUserApiKeyUnscoped(
    host: string | undefined,
    email: string,
    permissions: string[],
    label = 'Temporary key'
  ): Promise<ApiKeyResponse> {
    return this.issueUserApiKey(host, email, permissions, { label });
  }

  async issueUserApiKey(
    host: string | undefined,
    email: string,
    permissions: string[],
    options?: { label?: string }
  ): Promise<ApiKeyResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const response = await http.post<ApiKeyResponse & { label?: string; permissions?: unknown[] }>(
        `/api/v1/users/${encodeURIComponent(email)}/api-keys`,
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
      return this.maskError(error);
    }
  }

  async createStoreWithUserToken(
    host: string | undefined,
    apiKey: string,
    payload: { name: string; website?: string; defaultCurrency?: string; preferredExchange?: string }
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
      return this.maskError(error);
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

  async revokeUserApiKey(host: string | undefined, keyIdOrValue: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      await http.delete(`/api/v1/api-keys/${encodeURIComponent(keyIdOrValue)}`);
    } catch (error) {
      this.maskError(error);
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

  async registerWebhook(host: string | undefined, apiKey: string, storeId: string): Promise<WebhookResponse> {
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
      return this.maskError(error);
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
}
