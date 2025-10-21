import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';

export interface BootstrapKeyMeta {
  hasHash: boolean;
  label?: string;
  permissions?: string[];
}

export interface PersistedBootstrapMeta {
  apiKeyHash: string;
  label: string;
  permissions: string[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name, { timestamp: false });
  private readonly bootstrapPepper: Buffer;

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    configService: ConfigService
  ) {
    const pepperB64 = configService.get<string>('BTCPAY_API_KEY_PEPPER');
    if (!pepperB64) {
      throw new InternalServerErrorException('BTCPAY_API_KEY_PEPPER is not configured');
    }
    try {
      const decoded = Buffer.from(pepperB64, 'base64');
      if (decoded.length < 32) {
        decoded.fill(0);
        throw new Error('pepper must be at least 32 bytes when decoded');
      }
      this.bootstrapPepper = decoded;
    } catch (error) {
      throw new InternalServerErrorException('BTCPAY_API_KEY_PEPPER must be a valid Base64 string', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async getBootstrapMeta(userId: string): Promise<BootstrapKeyMeta> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const hasHash = typeof user.btcpayApiKeyHash === 'string' && user.btcpayApiKeyHash.trim().length > 0;
    const permissions = this.parsePermissions(user.btcpayApiKeyPermissions);
    return {
      hasHash,
      label: user.btcpayApiKeyLabel ?? undefined,
      permissions,
    } satisfies BootstrapKeyMeta;
  }

  async saveBootstrapMeta(userId: string, meta: PersistedBootstrapMeta): Promise<void> {
    const permissions = Array.from(new Set(meta.permissions)).filter((permission) => typeof permission === 'string');
    const payload = permissions.length > 0 ? JSON.stringify([...permissions].sort()) : null;
    await this.usersRepository.update(
      { id: userId },
      {
        btcpayApiKeyHash: meta.apiKeyHash,
        btcpayApiKeyLabel: meta.label,
        btcpayApiKeyPermissions: payload,
      }
    );
  }

  hashBootstrapApiKey(apiKey: string): string {
    const normalized = apiKey.trim();
    if (!normalized) {
      throw new InternalServerErrorException('Bootstrap API key cannot be empty');
    }
    const salt = randomBytes(16).toString('hex');
    const keyBuffer = Buffer.from(normalized, 'utf8');
    const digest = createHash('sha256')
      .update(this.bootstrapPepper)
      .update(':')
      .update(keyBuffer)
      .update(':')
      .update(salt)
      .digest('hex');
    keyBuffer.fill(0);
    return `${salt}:${digest}`;
  }

  private parsePermissions(raw: string | null): string[] | undefined {
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return undefined;
      }
      return parsed.filter((permission): permission is string => typeof permission === 'string');
    } catch (error) {
      this.logger.warn(`Failed to parse stored BTCPay permissions: ${(error as Error).message}`);
      return undefined;
    }
  }
}
