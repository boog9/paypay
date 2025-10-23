import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { normalizeEmail } from '../auth/email.utils';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { BtcpayService } from './btcpay.service';

interface WithStoreKeyOptions {
  host?: string;
}

@Injectable()
export class BtcpayKeysService {
  private readonly logger = new Logger(BtcpayKeysService.name, { timestamp: false });

  constructor(
    private readonly btcpayService: BtcpayService,
    private readonly encryptionService: EnvelopeEncryptionService
  ) {}

  async withStoreSettingsWriteKey<T>(
    storeId: string,
    userEmail: string,
    handler: (apiKey: string) => Promise<T>,
    options?: WithStoreKeyOptions
  ): Promise<T> {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const normalizedEmail = this.normalizeEmail(userEmail);
    const permission = `btcpay.store.canmodifystoresettings:${normalizedStoreId}`;

    const issuedKey = await this.btcpayService.issueUserApiKey(options?.host, normalizedEmail, [permission], {
      label: `portal-setup-${normalizedStoreId}`
    });

    const keyIdentifier = issuedKey.id ?? issuedKey.apiKey;
    const encrypted = this.encryptionService.encrypt(issuedKey.apiKey);
    this.clearBuffer(issuedKey.apiKey);
    let plaintextKey: string | null = null;

    try {
      plaintextKey = this.encryptionService.decrypt(encrypted.ciphertext, encrypted.dekWrapped);
      return await handler(plaintextKey);
    } finally {
      if (plaintextKey) {
        this.clearBuffer(plaintextKey);
      }
      this.clearBuffer(encrypted.ciphertext);
      this.clearBuffer(encrypted.dekWrapped);
      await this.revokeTemporaryKey(options?.host, normalizedEmail, keyIdentifier);
    }
  }

  private async revokeTemporaryKey(host: string | undefined, email: string, keyIdentifier: string | undefined): Promise<void> {
    if (!keyIdentifier) {
      return;
    }

    try {
      await this.btcpayService.deleteUserApiKeyForUser(host, email, keyIdentifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        {
          message: 'Failed to revoke temporary store settings key.',
          email,
          key: this.redactToken(keyIdentifier),
          error: message
        },
        'btcpay.tempKey.revoke'
      );
    }
  }

  private normalizeStoreId(value: string): string {
    const trimmed = value?.trim?.() ?? '';
    if (!trimmed) {
      throw new UnauthorizedException('Store context is required.');
    }
    return trimmed;
  }

  private normalizeEmail(value: string): string {
    const normalized = normalizeEmail(value ?? '');
    if (!normalized) {
      throw new UnauthorizedException('BTCPay user email is required.');
    }
    return normalized;
  }

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
}
