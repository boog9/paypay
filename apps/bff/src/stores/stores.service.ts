import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStoreDto } from './dto/create-store.dto';
import { ManagedStoreEntity } from './managed-store.entity';
import { BtcpayService } from '../btcpay/btcpay.service';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { normalizeEmail } from '../auth/email.utils';
import { UserEntity } from '../auth/entities/user.entity';
import { IdempotencyKeyEntity } from '../tenants/entities/idempotency-key.entity';

export interface AuthenticatedUserContext {
  email: string | null;
  bootstrapApiKey: string | null;
}

export interface StoreSummaryDto {
  id: string;
  name: string;
  defaultCurrency: string | null;
}

export interface StoreDto {
  id: string;
  name: string;
  defaultCurrency: string;
}

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name, { timestamp: false });
  private readonly createStoreIdempotencyRoute = '/api/stores';
  private readonly createStoreIdempotencySource = 'stores.create';

  constructor(
    @InjectRepository(ManagedStoreEntity)
    private readonly storesRepository: Repository<ManagedStoreEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(IdempotencyKeyEntity)
    private readonly idempotencyRepository: Repository<IdempotencyKeyEntity>,
    private readonly btcpayService: BtcpayService,
    private readonly encryptionService: EnvelopeEncryptionService,
  ) {}

  async createStore(
    dto: CreateStoreDto,
    context: AuthenticatedUserContext,
    idempotencyKey: string | null = null,
  ): Promise<StoreDto> {
    const email = this.normalizeEmail(context.email);
    if (!email) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    const compositeIdempotencyKey = normalizedIdempotencyKey
      ? this.buildCompositeIdemKey(user.id, normalizedIdempotencyKey)
      : null;
    if (compositeIdempotencyKey) {
      const cachedResult = await this.tryResolveIdempotentResult(compositeIdempotencyKey, user.id);
      if (cachedResult) {
        return cachedResult;
      }
    }

    const bootstrapKey = this.normalizeApiKey(context.bootstrapApiKey);
    if (!bootstrapKey) {
      throw new UnauthorizedException('Bootstrap API key is required to create a store.');
    }

    const storeName = this.normalizeStoreName(dto.name);
    const defaultCurrency = this.normalizeCurrency(dto.defaultCurrency);

    const existing = await this.storesRepository.findOne({ where: { userId: user.id, storeName } });
    if (existing) {
      throw new ConflictException('A store with this name already exists.');
    }

    const baseUrl = this.btcpayService.resolveBaseUrl();
    let createdStore: { id: string; name?: string | null } | null = null;
    let issuedKey: { apiKey: string; id?: string } | null = null;

    try {
      createdStore = await this.btcpayService.createStoreWithUserToken(baseUrl, bootstrapKey, {
        name: storeName,
        defaultCurrency,
      });

      if (!createdStore?.id) {
        throw new InternalServerErrorException('BTCPay did not return a store identifier.');
      }

      await this.btcpayService.setCoinGeckoAsDefaultRateSource(baseUrl, bootstrapKey, createdStore.id);

      issuedKey = await this.btcpayService.issueUserApiKey(
        baseUrl,
        email,
        this.btcpayService.buildStorePermissions(createdStore.id),
        { label: `portal-internal-${createdStore.id}` },
      );

      const encryptedKey = this.encryptionService.encrypt(issuedKey.apiKey);
      const entity = this.storesRepository.create({
        userId: user.id,
        btcpayHost: baseUrl,
        btcpayStoreId: createdStore.id,
        storeName: createdStore.name?.trim() || storeName,
        defaultCurrency,
        apiKeyCiphertext: encryptedKey.ciphertext,
        apiKeyDekWrapped: encryptedKey.dekWrapped,
        lastActiveAt: new Date(),
      });

      await this.storesRepository.save(entity);

      const result: StoreDto = {
        id: createdStore.id,
        name: createdStore.name?.trim() || storeName,
        defaultCurrency,
      } satisfies StoreDto;

      if (compositeIdempotencyKey) {
        await this.persistIdempotentResult(
          compositeIdempotencyKey,
          user.id,
          createdStore.id,
          result,
        );
      }

      return result;
    } catch (error) {
      if (issuedKey?.apiKey) {
        await this.safeRevokeKey(baseUrl, issuedKey.apiKey);
      }
      if (createdStore?.id) {
        this.logger.warn(`Store ${createdStore.id} creation failed; manual cleanup may be required.`);
      }
      throw error;
    } finally {
      this.clearBuffer(bootstrapKey);
      if (issuedKey?.apiKey) {
        this.clearBuffer(issuedKey.apiKey);
      }
    }
  }

  async listStores(context: AuthenticatedUserContext): Promise<StoreSummaryDto[]> {
    const email = this.normalizeEmail(context.email);
    if (!email) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const bootstrapKey = this.normalizeApiKey(context.bootstrapApiKey);
    const baseUrl = this.btcpayService.resolveBaseUrl();

    let apiKey = bootstrapKey;
    let cleanup: (() => void) | null = null;

    if (!apiKey) {
      const fallback = await this.findFallbackStoreKey(email);
      if (!fallback) {
        return [];
      }
      apiKey = fallback;
      cleanup = () => this.clearBuffer(fallback);
    }

    try {
      const stores = await this.btcpayService.listStores(baseUrl, apiKey);
      return stores.map((store) => ({
        id: store.id,
        name: store.name?.trim() || 'Unnamed store',
        defaultCurrency: store.defaultCurrency?.trim() ?? null,
      }));
    } finally {
      if (cleanup) {
        cleanup();
      }
    }
  }

  private normalizeEmail(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const normalized = normalizeEmail(value);
    return normalized.trim() ? normalized : null;
  }

  private normalizeStoreName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new InternalServerErrorException('Store name is required.');
    }
    return trimmed;
  }

  private normalizeCurrency(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new InternalServerErrorException('Default currency is required.');
    }
    return trimmed.toUpperCase();
  }

  private normalizeApiKey(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeIdempotencyKey(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildCompositeIdemKey(userId: string, rawKey: string): string {
    return `${userId}:${rawKey}`;
  }

  private clearBuffer(value: string | null | undefined): void {
    if (!value) {
      return;
    }
    try {
      const buffer = Buffer.from(value, 'utf8');
      buffer.fill(0);
    } catch {
      // best-effort; ignore failures
    }
  }

  private async findFallbackStoreKey(email: string): Promise<string | null> {
    const user = await this.usersRepository.findOne({ where: { email }, relations: ['managedStores'] });
    if (!user || !user.managedStores?.length) {
      return null;
    }
    const [store] = user.managedStores.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (!store) {
      return null;
    }
    try {
      return this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
      this.logger.error(`Failed to decrypt API key for store ${store.btcpayStoreId}`);
      throw new InternalServerErrorException('Failed to decrypt stored API key', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async safeRevokeKey(baseUrl: string, apiKey: string): Promise<void> {
    try {
      await this.btcpayService.revokeUserApiKey(baseUrl, apiKey);
    } catch (error) {
      this.logger.warn(`Failed to revoke BTCPay API key: ${(error as Error).message}`);
    }
  }

  private async tryResolveIdempotentResult(
    key: string,
    userId: string
  ): Promise<StoreDto | null> {
    try {
      const record = await this.idempotencyRepository.findOne({
        where: { key, userId, route: this.createStoreIdempotencyRoute },
      });
      return this.deserializeStoreResult(record);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve idempotency key ${key} for user ${userId}: ${(error as Error).message}`
      );
      return null;
    }
  }

  private deserializeStoreResult(record: IdempotencyKeyEntity | null): StoreDto | null {
    if (!record) {
      return null;
    }
    if (record.responseStatus !== 201) {
      return null;
    }
    if (typeof record.responseBody !== 'string' || !record.responseBody.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(record.responseBody) as unknown;
      if (this.isStoreDto(parsed)) {
        return parsed;
      }
      this.logger.warn(`Idempotency key ${record.key} contained an unexpected payload shape.`);
    } catch (error) {
      this.logger.warn(
        `Failed to parse cached idempotent response for key ${record.key}: ${(error as Error).message}`
      );
    }
    return null;
  }

  private async persistIdempotentResult(
    key: string,
    userId: string,
    resourceId: string,
    result: StoreDto
  ): Promise<void> {
    try {
      const payload = JSON.stringify(result);
      const record = this.idempotencyRepository.create({
        key,
        tenantId: null,
        userId,
        source: this.createStoreIdempotencySource,
        route: this.createStoreIdempotencyRoute,
        resourceId,
        responseStatus: 201,
        responseBody: payload,
      });
      await this.idempotencyRepository.save(record);
    } catch (error) {
      this.logger.warn(
        `Failed to persist idempotent response for key ${key}: ${(error as Error).message}`
      );
    }
  }

  private isStoreDto(value: unknown): value is StoreDto {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as { id?: unknown; name?: unknown; defaultCurrency?: unknown };
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.defaultCurrency === 'string'
    );
  }
}
