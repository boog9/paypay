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
import { BTCPAY_MINIMAL_PERMISSIONS } from './btcpay.constants';
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
}

interface WebhookResponse {
  id: string;
  secret?: string | null;
}

interface StoreResponse {
  id: string;
  name?: string;
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
        ...headers
      },
      timeout: 15_000
    });
  }

  private maskError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const err = error as AxiosError<{ message?: string; errors?: unknown }>;
      const code = err.response?.status ?? 500;
      const body = err.response?.data;
      this.logger.error(`BTCPay request failed with status ${code}`, body ? JSON.stringify(body) : undefined);
      const message = body?.message ?? 'BTCPay request failed';
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

  async createUserApiKey(host: string | undefined, email: string, storeId: string, includePullPayments = false): Promise<ApiKeyResponse> {
    const permissions = this.buildStorePermissions(storeId, includePullPayments);
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const { data } = await http.post<ApiKeyResponse>(`/api/v1/users/${encodeURIComponent(email)}/api-keys`, {
        label: `Store ${storeId} key`,
        permissions
      });
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async createUserApiKeyUnscoped(
    host: string | undefined,
    email: string,
    permissions: string[],
    label = 'Temporary key'
  ): Promise<ApiKeyResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      const { data } = await http.post<ApiKeyResponse>(`/api/v1/users/${encodeURIComponent(email)}/api-keys`, {
        label,
        permissions
      });
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async createStoreWithUserToken(host: string | undefined, apiKey: string, payload: { name: string }): Promise<StoreResponse> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.post<StoreResponse>('/api/v1/stores', payload);
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async deleteApiKey(host: string | undefined, apiKey: string): Promise<void> {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${this.getAdminApiKey()}`
    });
    try {
      await http.delete(`/api/v1/api-keys/${encodeURIComponent(apiKey)}`);
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
        url: this.getWebhookUrl()
      });
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async createInvoice(opts: {
    storeId: string;
    payload: CreateInvoiceRequest;
    apiKey?: string;
    host?: string;
  }) {
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

  private async doCreateInvoice(host: string, apiKey: string, storeId: string, payload: CreateInvoiceRequest) {
    const http = this.createHttp(host, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.post(`/api/v1/stores/${storeId}/invoices`, payload);
      return data;
    } catch (error) {
      return this.maskError(error);
    }
  }

  async getStore(host: string | undefined, apiKey: string, storeId: string) {
    const http = this.createHttp(host ?? this.config.baseUrl, {
      Authorization: `token ${apiKey}`
    });
    try {
      const { data } = await http.get(`/api/v1/stores/${storeId}`);
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

  private buildStorePermissions(storeId: string, includePullPayments: boolean): string[] {
    const scoped = BTCPAY_MINIMAL_PERMISSIONS.map((permission) => `${permission}:${storeId}`);
    if (!includePullPayments) {
      return scoped.filter((permission) => !permission.startsWith('btcpay.store.cancreatenonapprovedpullpayments'));
    }
    return scoped;
  }
}
