import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagedStoreEntity } from './managed-store.entity';
import { BtcpayService } from '../btcpay/btcpay.service';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { normalizeEmail } from '../auth/email.utils';
import { UserEntity } from '../auth/entities/user.entity';
import { IdempotencyKeyEntity } from '../tenants/entities/idempotency-key.entity';
import { UsersService } from '../auth/users.service';
import { StoreSettingsDto } from './dto/update-store-settings.dto';

export interface AuthenticatedUserContext {
  userId: string | null;
  email: string | null;
  bootstrapApiKey: string | null;
}

export interface StoreSummaryDto {
  id: string;
  name: string;
  defaultCurrency: string | null;
}

export interface StoreDto {
  storeId: string;
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
    private readonly usersService: UsersService,
  ) {}

  async provisionStoreForUser(
    userId: string | null,
    email: string | null,
    dto: { name: string; defaultCurrency?: string },
    idempotencyKey: string | null = null,
  ): Promise<StoreDto> {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedEmail || !normalizedUserId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const user = await this.usersRepository.findOne({ where: { id: normalizedUserId } });
    if (!user || normalizeEmail(user.email) !== normalizedEmail) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }
    const btcpaySubject = user.btcpayUserId?.trim() ?? null;
    const subject = btcpaySubject && btcpaySubject.length > 0 ? btcpaySubject : normalizedEmail;

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

    const storeName = this.normalizeStoreName(dto.name);
    const defaultCurrency = this.normalizeCurrency(dto.defaultCurrency);

    const existing = await this.storesRepository.findOne({ where: { userId: user.id, storeName } });
    if (existing) {
      throw new ConflictException('A store with this name already exists.');
    }

    const baseUrl = this.btcpayService.resolveBaseUrl();
    const bootstrapKey = await this.issueBootstrapKey(user.id, subject);
    let createdStore: { id: string; name?: string | null } | null = null;
    let issuedStoreKey: string | null = null;
    let webhookSecret: string | null = null;
    let webhookId: string | null = null;

    try {
      createdStore = await this.btcpayService.createStoreUsingUserKey(bootstrapKey, {
        name: storeName,
        defaultCurrency,
      });

      if (!createdStore?.id) {
        throw new InternalServerErrorException('BTCPay did not return a store identifier.');
      }

      await this.btcpayService.setCoinGeckoAsDefaultRateSource(baseUrl, bootstrapKey, createdStore.id);

      const storeScopedKey = await this.btcpayService.issueStoreScopedApiKey(subject, createdStore.id, {
        labelPrefix: 'portal-internal',
      });

      issuedStoreKey = storeScopedKey.apiKey;

      const webhook = await this.btcpayService.registerWebhook(baseUrl, storeScopedKey.apiKey, createdStore.id);
      if (!webhook?.secret) {
        throw new InternalServerErrorException('BTCPay did not return a webhook secret.');
      }

      webhookSecret = webhook.secret;
      webhookId = webhook.id ?? null;

      const encryptedKey = this.encryptionService.encrypt(storeScopedKey.apiKey);
      const encryptedWebhook = this.encryptionService.encrypt(webhookSecret, encryptedKey.dekWrapped);
      const entity = this.storesRepository.create({
        userId: user.id,
        btcpayHost: baseUrl,
        btcpayStoreId: createdStore.id,
        storeName: createdStore.name?.trim() || storeName,
        defaultCurrency,
        apiKeyCiphertext: encryptedKey.ciphertext,
        apiKeyDekWrapped: encryptedKey.dekWrapped,
        webhookId,
        webhookSecretCiphertext: encryptedWebhook.ciphertext,
        webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
        storeKeyLastFour: this.extractLastFour(storeScopedKey.apiKey),
        lastActiveAt: new Date(),
      });

      await this.storesRepository.save(entity);

      const result: StoreDto = {
        storeId: createdStore.id,
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

      if (process.env.REVOKE_BOOTSTRAP_AFTER_CREATE === 'true') {
        try {
          await this.btcpayService.revokeUserApiKey(baseUrl, bootstrapKey);
        } catch (revokeError) {
          const message = revokeError instanceof Error ? revokeError.message : String(revokeError);
          this.logger.warn(`Failed to revoke bootstrap key: ${message}`);
        }
      }

      return result;
    } catch (error) {
      if (webhookId && issuedStoreKey && createdStore?.id) {
        await this.safeDeleteWebhook(baseUrl, issuedStoreKey, createdStore.id, webhookId);
      }
      if (issuedStoreKey) {
        await this.safeRevokeKey(baseUrl, issuedStoreKey);
      }
      if (createdStore?.id) {
        this.logger.warn(`Store ${createdStore.id} creation failed; manual cleanup may be required.`);
      }
      throw error;
    } finally {
      this.clearBuffer(bootstrapKey);
      if (issuedStoreKey) {
        this.clearBuffer(issuedStoreKey);
      }
      if (webhookSecret) {
        this.clearBuffer(webhookSecret);
      }
    }
  }

  async listStores(context: AuthenticatedUserContext): Promise<StoreSummaryDto[]> {
    const email = this.normalizeEmail(context.email);
    const userId = this.normalizeUserId(context.userId);
    if (!email || !userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const bootstrapKey = this.normalizeApiKey(context.bootstrapApiKey);
    const baseUrl = this.btcpayService.resolveBaseUrl();

    let apiKey = bootstrapKey;
    let cleanup: (() => void) | null = null;

    if (!apiKey) {
      const fallback = await this.findFallbackStoreKey(userId);
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

  async getStoreSettings(context: AuthenticatedUserContext, storeId: string): Promise<StoreSettingsDto> {
    const email = this.normalizeEmail(context.email);
    const userId = this.normalizeUserId(context.userId);
    if (!email || !userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const store = await this.findOwnedStore(userId, storeId);
    const baseUrl = this.btcpayService.resolveBaseUrl(store.btcpayHost);
    const apiKey = this.decryptStoreApiKey(store);

    try {
      const response = await this.btcpayService.getStore(baseUrl, apiKey, store.btcpayStoreId);
      return this.mapStoreSettings(store, response);
    } finally {
      this.clearBuffer(apiKey);
    }
  }

  async updateStoreSettings(
    context: AuthenticatedUserContext,
    storeId: string,
    dto: { name?: string; website?: string | null; defaultCurrency?: string }
  ): Promise<StoreSettingsDto> {
    const email = this.normalizeEmail(context.email);
    const userId = this.normalizeUserId(context.userId);
    if (!email || !userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const store = await this.findOwnedStore(userId, storeId);
    const user = await this.getAuthorizedUser(userId, email);
    const baseUrl = this.btcpayService.resolveBaseUrl(store.btcpayHost);
    const permission = `btcpay.store.canmodifystoresettings:${store.btcpayStoreId}`;

    let issuedKey: { apiKey: string; id?: string } | null = null;
    try {
      issuedKey = await this.btcpayService.issueUserApiKey(baseUrl, this.resolveBtcpaySubject(user, email), [permission], {
        label: 'portal-store-settings'
      });

      const response = await this.btcpayService.updateStore(baseUrl, issuedKey.apiKey, store.btcpayStoreId, {
        name: dto.name,
        website: dto.website,
        defaultCurrency: dto.defaultCurrency
      });

      const nextName = response?.name?.trim();
      if (nextName) {
        store.storeName = nextName;
      }

      const nextCurrency = response?.defaultCurrency?.trim();
      if (nextCurrency) {
        store.defaultCurrency = nextCurrency.toUpperCase();
      }

      await this.storesRepository.save(store);

      return this.mapStoreSettings(store, response);
    } finally {
      if (issuedKey) {
        const keyIdentifier = issuedKey.id ?? issuedKey.apiKey;
        await this.safeRevokeKey(baseUrl, keyIdentifier);
        this.clearBuffer(issuedKey.apiKey);
      }
    }
  }

  async deleteStore(context: AuthenticatedUserContext, storeId: string): Promise<void> {
    const email = this.normalizeEmail(context.email);
    const userId = this.normalizeUserId(context.userId);
    if (!email || !userId) {
      throw new UnauthorizedException('Authenticated user context is required.');
    }

    const store = await this.findOwnedStore(userId, storeId);
    const user = await this.getAuthorizedUser(userId, email);
    const baseUrl = this.btcpayService.resolveBaseUrl(store.btcpayHost);
    const permission = `btcpay.store.canmodifystoresettings:${store.btcpayStoreId}`;

    let issuedKey: { apiKey: string; id?: string } | null = null;
    try {
      issuedKey = await this.btcpayService.issueUserApiKey(baseUrl, this.resolveBtcpaySubject(user, email), [permission], {
        label: 'portal-store-settings'
      });

      await this.btcpayService.deleteStore(baseUrl, issuedKey.apiKey, store.btcpayStoreId);
      await this.storesRepository.remove(store);
    } finally {
      if (issuedKey) {
        const keyIdentifier = issuedKey.id ?? issuedKey.apiKey;
        await this.safeRevokeKey(baseUrl, keyIdentifier);
        this.clearBuffer(issuedKey.apiKey);
      }
    }
  }

  private async findOwnedStore(userId: string, storeId: string): Promise<ManagedStoreEntity> {
    const normalizedId = typeof storeId === 'string' ? storeId.trim() : '';
    if (!normalizedId) {
      throw new NotFoundException('Store not found');
    }

    const entity = await this.storesRepository.findOne({
      where: { userId, btcpayStoreId: normalizedId }
    });

    if (!entity) {
      throw new NotFoundException('Store not found');
    }

    return entity;
  }

  private async getAuthorizedUser(userId: string, email: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user || this.normalizeEmail(user.email) !== email) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }
    return user;
  }

  private decryptStoreApiKey(store: ManagedStoreEntity): string {
    try {
      return this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    } catch (error) {
      this.logger.error(`Failed to decrypt BTCPay API key for store ${store.btcpayStoreId}`);
      throw new InternalServerErrorException('Failed to decrypt BTCPay API key', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  private resolveBtcpaySubject(user: UserEntity, fallbackEmail: string): string {
    const subject = user.btcpayUserId?.trim();
    if (subject) {
      return subject;
    }
    return fallbackEmail;
  }

  private mapStoreSettings(
    store: ManagedStoreEntity,
    payload: { name?: string | null; website?: string | null; defaultCurrency?: string | null } | null
  ): StoreSettingsDto {
    const name = payload?.name?.trim() || store.storeName?.trim() || 'Unnamed store';
    const websiteCandidate = payload?.website ?? null;
    const website =
      typeof websiteCandidate === 'string' && websiteCandidate.trim()
        ? websiteCandidate.trim()
        : null;
    const defaultCurrency =
      payload?.defaultCurrency?.trim()?.toUpperCase() ||
      store.defaultCurrency?.trim()?.toUpperCase() ||
      'BTC';

    return {
      storeId: store.btcpayStoreId,
      name,
      website,
      defaultCurrency
    } satisfies StoreSettingsDto;
  }

  private normalizeEmail(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const normalized = normalizeEmail(value);
    return normalized.trim() ? normalized : null;
  }

  private normalizeUserId(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeStoreName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new InternalServerErrorException('Store name is required.');
    }
    return trimmed;
  }

  private normalizeCurrency(value: string | undefined): string {
    if (!value) {
      throw new InternalServerErrorException('Default currency is required.');
    }
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

  private async issueBootstrapKey(userId: string, subject: string): Promise<string> {
    const meta = await this.usersService.getBootstrapMeta(userId);
    const permissions =
      meta.permissions && meta.permissions.length > 0
        ? Array.from(new Set(meta.permissions))
        : this.btcpayService.buildBootstrapPermissions();
    const label = meta.label?.trim() || 'portal-bootstrap';
    const issued = await this.btcpayService.issueUserApiKeyWithPermissions(undefined, subject, permissions, label);
    const hash = this.usersService.hashBootstrapApiKey(issued.apiKey);
    await this.usersService.saveBootstrapMeta(userId, {
      apiKeyHash: hash,
      label,
      permissions,
    });
    return issued.apiKey;
  }

  private extractLastFour(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.slice(-4);
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

  private async findFallbackStoreKey(userId: string): Promise<string | null> {
    const stores = await this.storesRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    const [store] = stores;
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

  private async safeRevokeKey(host: string, apiKeyOrId: string): Promise<void> {
    try {
      await this.btcpayService.revokeUserApiKey(host, apiKeyOrId);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke BTCPay API key`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  private async safeDeleteWebhook(
    baseUrl: string,
    apiKey: string,
    storeId: string,
    webhookId: string
  ): Promise<void> {
    try {
      await this.btcpayService.deleteWebhook(baseUrl, apiKey, storeId, webhookId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete BTCPay webhook ${webhookId} for store ${storeId}: ${(error as Error).message}`
      );
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
    if (record.responseStatus !== 200) {
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
        responseStatus: 200,
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
    const candidate = value as { storeId?: unknown; name?: unknown; defaultCurrency?: unknown };
    return (
      typeof candidate.storeId === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.defaultCurrency === 'string'
    );
  }
}
