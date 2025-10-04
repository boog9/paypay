import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { BTCPAY_PORTAL_USER_PERMISSIONS } from './btcpay.constants';
import { BTCPAY_CONFIG, type BtcpayRuntimeConfig } from './btcpay.tokens';

type CreateUserResponse = {
  id?: string;
  email: string;
};

type CreateApiKeyResponse = {
  apiKey: string;
  label: string;
  permissions: string[];
};

@Injectable()
export class BtcpayProvisioningService {
  private readonly logger = new Logger(BtcpayProvisioningService.name, { timestamp: false });

  constructor(@Inject(BTCPAY_CONFIG) private readonly config: BtcpayRuntimeConfig) {}

  async createUserInBtcpay(email: string, password: string): Promise<CreateUserResponse | null> {
    const payload = { email, password, sendInvitationEmail: false };

    return this.performRequest<CreateUserResponse | null>({
      operation: 'create-user',
      code: 'INTEGRATION_BTCPAY_CREATE_USER_FAILED',
      handler: async (http) => {
        const { data } = await http.post<CreateUserResponse>('/api/v1/users', payload);
        await this.finalizeInvitationIfPresent(email);
        return data;
      },
      recover: (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          this.logger.warn('BTCPay user already exists during provisioning. Reusing existing account.');
          return null;
        }
        return undefined;
      }
    });
  }

  async createUserApiKey(
    email: string,
    label: string,
    permissions: readonly string[] = BTCPAY_PORTAL_USER_PERMISSIONS
  ): Promise<CreateApiKeyResponse> {
    const requestPayload = {
      label,
      permissions: Array.from(new Set(permissions))
    };

    return this.performRequest<CreateApiKeyResponse>({
      operation: 'create-api-key',
      code: 'INTEGRATION_BTCPAY_CREATE_API_KEY_FAILED',
      handler: async (http) => {
        const { data } = await http.post<CreateApiKeyResponse>(
          `/api/v1/users/${encodeURIComponent(email)}/api-keys`,
          requestPayload,
          {
            headers: {
              'Idempotency-Key': randomUUID()
            }
          }
        );
        return data;
      }
    });
  }

  getDefaultPermissions(): readonly string[] {
    return BTCPAY_PORTAL_USER_PERMISSIONS;
  }

  private normalizeInvitationUrl(rawUrl: string): string | undefined {
    if (!rawUrl) {
      return undefined;
    }
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        return undefined;
      }
      const url = new URL(trimmed, this.config.baseUrl);
      return url.toString();
    } catch (error) {
      this.logger.warn(`Invalid BTCPay invitation URL received: ${rawUrl}`);
      return undefined;
    }
  }

  private async finalizeInvitationIfPresent(email: string): Promise<void> {
    try {
      const http = this.createHttp();
      const encodedEmail = encodeURIComponent(email);
      const { data } = await http.get<{ invitationUrl?: string | null }>(`/api/v1/users/${encodedEmail}`);
      const invitationUrl = this.normalizeInvitationUrl(data?.invitationUrl ?? '');
      if (!invitationUrl) {
        return;
      }

      try {
        await axios.get(invitationUrl, {
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'PayPay-BFF/1.0'
          },
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) {
          this.logger.warn(
            `BTCPay invitation finalization returned status ${error.response.status} for user ${email}. Continuing without failing.`
          );
          return;
        }
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to finalize BTCPay invitation for ${email}: ${message}`);
    }
  }

  private createHttp(): AxiosInstance {
    const baseURL = this.config.baseUrl.replace(/\/$/, '');
    return axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'PayPay-BFF/1.0',
        Authorization: `token ${this.config.adminApiKey}`
      },
      timeout: 10_000,
      maxBodyLength: 2 * 1024 * 1024,
      maxContentLength: 2 * 1024 * 1024
    });
  }

  private async performRequest<T>({
    operation,
    code,
    handler,
    recover
  }: {
    operation: string;
    code: `INTEGRATION_BTCPAY_${string}`;
    handler: (http: AxiosInstance) => Promise<T>;
    recover?: (error: unknown) => T | undefined;
  }): Promise<T> {
    const http = this.createHttp();
    const maxAttempts = 3;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      try {
        return await handler(http);
      } catch (error) {
        lastError = error;
        const recovered = recover?.(error);
        if (recovered !== undefined) {
          return recovered;
        }

        if (this.isRetryableError(error) && attempt < maxAttempts - 1) {
          const backoff = Math.pow(2, attempt) * 200;
          await this.delay(backoff);
          attempt += 1;
          continue;
        }
        throw this.toHttpException(error, code, operation);
      }
    }

    throw this.toHttpException(lastError, code, operation);
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }
    const status = error.response?.status;
    if (status && status >= 500) {
      return true;
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    return false;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toHttpException(error: unknown, code: string, operation: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const message = this.extractErrorMessage(error, operation);
      const payload = { code, message };
      const cause = error as Error;
      switch (status) {
        case 400:
          throw new BadRequestException(payload, { cause });
        case 401:
          throw new UnauthorizedException(payload, { cause });
        case 403:
          throw new ForbiddenException(payload, { cause });
        case 404:
          throw new NotFoundException(payload, { cause });
        default:
          throw new BadGatewayException(payload, { cause });
      }
    }

    throw new BadGatewayException(
      { code, message: `BTCPay integration failed: ${operation}` },
      { cause: error instanceof Error ? error : undefined }
    );
  }

  private extractErrorMessage(error: AxiosError, operation: string): string {
    const raw = error.response?.data as any;
    const remoteMessage = typeof raw?.message === 'string' ? raw.message : undefined;
    return remoteMessage?.trim() && remoteMessage.length <= 256
      ? remoteMessage.trim()
      : `BTCPay integration failed: ${operation}`;
  }
}
