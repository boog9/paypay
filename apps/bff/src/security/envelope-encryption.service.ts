import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

interface AuthenticatedPayload {
  iv: string;
  ciphertext: string;
  authTag: string;
}

export interface EncryptResult {
  ciphertext: string;
  dekWrapped: string;
}

@Injectable()
export class EnvelopeEncryptionService {
  private readonly logger = new Logger(EnvelopeEncryptionService.name, { timestamp: false });
  private readonly masterKey: Buffer;

  constructor(configService: ConfigService) {
    const masterKeyB64 = configService.get<string>('BTCPAY_MASTER_KEY');
    if (!masterKeyB64) {
      throw new InternalServerErrorException('BTCPAY_MASTER_KEY is not configured');
    }
    const decoded = Buffer.from(masterKeyB64, 'base64');
    if (decoded.length !== 32) {
      decoded.fill(0);
      throw new InternalServerErrorException('BTCPAY_MASTER_KEY must be a 256-bit base64 value');
    }
    this.masterKey = decoded;
  }

  encrypt(plaintext: string, dekWrapped?: string): EncryptResult {
    const plaintextBuffer = Buffer.from(plaintext, 'utf8');
    try {
      const dek = dekWrapped ? this.unwrapDek(dekWrapped) : randomBytes(32);
      const { payload, authTag } = this.encryptWithDek(plaintextBuffer, dek);
      const wrappedDek = dekWrapped ?? this.wrapDek(dek);
      dek.fill(0);
      return { ciphertext: JSON.stringify({ ...payload, authTag }), dekWrapped: wrappedDek };
    } finally {
      plaintextBuffer.fill(0);
    }
  }

  decrypt(ciphertext: string, dekWrapped: string): string {
    const dek = this.unwrapDek(dekWrapped);
    try {
      const payload = this.parsePayload(ciphertext);
      const plaintextBuffer = this.decryptWithDek(payload, dek);
      try {
        return plaintextBuffer.toString('utf8');
      } finally {
        plaintextBuffer.fill(0);
      }
    } finally {
      dek.fill(0);
    }
  }

  rewrapDek(dekWrapped: string): string {
    const dek = this.unwrapDek(dekWrapped);
    try {
      return this.wrapDek(dek);
    } finally {
      dek.fill(0);
    }
  }

  private encryptWithDek(
    plaintext: Buffer,
    dek: Buffer
  ): { payload: Omit<AuthenticatedPayload, 'authTag'>; authTag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      payload: {
        iv: iv.toString('base64'),
        ciphertext: ciphertext.toString('base64')
      },
      authTag: authTag.toString('base64')
    };
  }

  private decryptWithDek(payload: AuthenticatedPayload, dek: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
  }

  private wrapDek(dek: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const wrappedPayload: AuthenticatedPayload = {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64')
    };
    return JSON.stringify(wrappedPayload);
  }

  private unwrapDek(wrapped: string): Buffer {
    const payload = this.parsePayload(wrapped);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
  }

  private parsePayload(raw: string): AuthenticatedPayload {
    try {
      const parsed = JSON.parse(raw) as AuthenticatedPayload;
      if (!parsed.iv || !parsed.ciphertext || !parsed.authTag) {
        throw new Error('Missing required fields');
      }
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse encryption payload');
      throw new InternalServerErrorException('Corrupted encryption payload', { cause: error as Error });
    }
  }
}
