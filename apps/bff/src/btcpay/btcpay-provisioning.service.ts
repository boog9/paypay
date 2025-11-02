import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import { BTCPAY_PORTAL_USER_PERMISSIONS } from './btcpay.constants';
import { BTCPAY_CONFIG, type BtcpayRuntimeConfig } from './btcpay.tokens';

export class ProvisioningError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

interface CreateUserResponse {
  id?: string;
  email: string;
}

interface CreateApiKeyResponse {
  apiKey: string;
  label: string;
  permissions: string[];
}

function idempotencyForApiKey(email: string): string {
  return createHash('sha256').update(`create-api-key:${email.toLowerCase()}`).digest('hex');
}

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
              'Idempotency-Key': idempotencyForApiKey(email)
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
    } catch (error: unknown) {
      const err = ensureError(error);
      this.logger.warn(`Invalid BTCPay invitation URL received: ${rawUrl}. ${err.message}`);
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
      } catch (error: unknown) {
        if (
          axios.isAxiosError(error) &&
          error.response &&
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          this.logger.warn(
            `BTCPay invitation finalization returned status ${error.response.status} for user ${email}. Continuing without failing.`
          );
          return;
        }
        throw ensureError(error);
      }
    } catch (error: unknown) {
      const err = ensureError(error);
      this.logger.warn(`Failed to finalize BTCPay invitation for ${email}: ${err.message}`);
    }
  }

  private createHttp(): AxiosInstance {
    const baseURL = this.config.baseUrl.replace(/\/$/, '');
    return axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
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
    let lastError: unknown = new Error('Unknown BTCPay provisioning error');

    while (attempt < maxAttempts) {
      try {
        return await handler(http);
      } catch (error: unknown) {
        lastError = error;
        if (axios.isAxiosError(error) && error.response?.status === 422) {
          this.handleUnprocessableError(error, code, operation);
        }
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
        this.raiseProvisioningError(error, code, operation);
      }
    }

    this.raiseProvisioningError(lastError, code, operation);
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

  private handleUnprocessableError(
    error: AxiosError<unknown>,
    code: `INTEGRATION_BTCPAY_${string}`,
    operation: string
  ): never {
    const sanitizedMessage = this.buildPasswordPolicyMessage(error, operation);
    this.logger.warn({ operation, status: 422 }, 'BTCPay request rejected with 422');
    throw new UnprocessableEntityException({ code, message: sanitizedMessage }, { cause: error });
  }

  private buildPasswordPolicyMessage(error: AxiosError<unknown>, operation: string): string {
    if (operation === 'create-user') {
      const reason = this.extractPasswordPolicyReason(error);
      if (reason) {
        return `Password does not meet BTCPay requirements: ${reason}`;
      }
      return 'Password does not meet BTCPay requirements.';
    }
    return this.extractErrorMessage(error, operation);
  }

  private extractPasswordPolicyReason(error: AxiosError<unknown>): string | undefined {
    const data = error.response?.data;
    const messages: string[] = [];

    if (!data) {
      return undefined;
    }

    if (typeof data === 'string') {
      const trimmed = this.sanitizeMessage(data);
      if (trimmed) {
        messages.push(trimmed);
      }
    }

    if (typeof data === 'object') {
      const payload = data as { message?: unknown; errors?: unknown };
      const maybeMessage = payload.message;
      if (typeof maybeMessage === 'string') {
        const trimmed = this.sanitizeMessage(maybeMessage);
        if (trimmed) {
          messages.push(trimmed);
        }
      }

      const maybeErrors = payload.errors;
      if (maybeErrors && typeof maybeErrors === 'object') {
        for (const value of Object.values(maybeErrors as Record<string, unknown>)) {
          if (Array.isArray(value)) {
            for (const entry of value) {
              if (typeof entry === 'string') {
                const trimmed = this.sanitizeMessage(entry);
                if (trimmed) {
                  messages.push(trimmed);
                }
              }
            }
          } else if (typeof value === 'string') {
            const trimmed = this.sanitizeMessage(value);
            if (trimmed) {
              messages.push(trimmed);
            }
          }
        }
      }
    }

    if (messages.length === 0) {
      return undefined;
    }

    const unique = Array.from(new Set(messages));
    return unique.join('; ').slice(0, 256);
  }

  private sanitizeMessage(message: string): string {
    return message.replace(/\s+/g, ' ').trim().slice(0, 256);
  }

  private raiseProvisioningError(
    error: unknown,
    code: `INTEGRATION_BTCPAY_${string}`,
    operation: string
  ): never {
    const err = ensureError(error);
    this.logger.error({ err, operation }, 'BTCPay provisioning failed');
    const message = axios.isAxiosError(error)
      ? this.extractErrorMessage(error, operation)
      : `BTCPay integration failed: ${operation}`;
    const provisioningError = new ProvisioningError(message, err);
    this.toHttpException(provisioningError, code, operation);
  }

  private toHttpException(error: ProvisioningError, code: string, operation: string): never {
    const cause = error.cause ? ensureError(error.cause) : error;
    if (axios.isAxiosError(cause)) {
      const status = cause.response?.status ?? 502;
      const payload = { code, message: error.message };
      switch (status) {
        case 400:
          throw new BadRequestException(payload, { cause: error });
        case 401:
          throw new UnauthorizedException(payload, { cause: error });
        case 403:
          throw new ForbiddenException(payload, { cause: error });
        case 404:
          throw new NotFoundException(payload, { cause: error });
        default:
          throw new BadGatewayException(payload, { cause: error });
      }
    }

    throw new BadGatewayException(
      { code, message: error.message || `BTCPay integration failed: ${operation}` },
      { cause: error }
    );
  }

  private extractErrorMessage(error: AxiosError<unknown>, operation: string): string {
    const data = error.response?.data;
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed) {
        return trimmed.slice(0, 256);
      }
    }
    if (data && typeof data === 'object') {
      const maybeMessage = (data as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        const trimmed = maybeMessage.trim();
        if (trimmed) {
          return trimmed.slice(0, 256);
        }
      }
    }
    const fallback = error.message?.trim();
    if (fallback) {
      return fallback.slice(0, 256);
    }
    return `BTCPay integration failed: ${operation}`;
  }
}
