import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantEntity } from './entities/tenant.entity';
import { StoreEntity } from './entities/store.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { EnvelopeEncryptionService } from '../security/envelope-encryption.service';
import { BtcpayService } from '../btcpay/btcpay.service';
import { CreateTenantInvoiceDto } from './dto/create-invoice.dto';
import { normalizeEmail } from '../auth/email.utils';

export interface CreateTenantResult {
  tenantId: string;
  storeId: string;
  btcpayStoreId: string;
}

export interface StoreSettingsResult {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  btcpayHost: string;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
}

export interface TenantStoreSummary {
  storeId: string;
  btcpayStoreId: string;
  storeName: string | null;
  storeWebsite: string | null;
  storeKeyLastFour: string | null;
  btcpayHost: string;
  walletSetupStatus: string;
  apiKeyManagedByTenant: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name, { timestamp: false });
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantsRepository: Repository<TenantEntity>,
    @InjectRepository(StoreEntity)
    private readonly storesRepository: Repository<StoreEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepository: Repository<AuditLogEntity>,
    @InjectRepository(IdempotencyKeyEntity)
    private readonly idempotencyRepository: Repository<IdempotencyKeyEntity>,
    private readonly encryptionService: EnvelopeEncryptionService,
    private readonly btcpayService: BtcpayService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {
    const raw = this.configService.get<string>('REVOKE_BOOTSTRAP_AFTER_CREATE');
    this.revokeBootstrapAfterCreate = raw ? this.isTruthy(raw) : true;
  }

  private readonly revokeBootstrapAfterCreate: boolean;

  async createTenant(dto: CreateTenantDto, actorId: string | null, ip: string | null): Promise<CreateTenantResult> {
    const baseUrl = this.btcpayService.resolveBaseUrl(dto.btcpayHost);
    const storeWebsite = this.sanitizeWebsite(dto.storeWebsite);
    const storeName = this.sanitizeStoreName(dto.storeName);
    await this.btcpayService.createUser(baseUrl, {
      email: dto.email,
      name: dto.name,
      sendInvitationEmail: true
    });

    const bootstrapKey = await this.btcpayService.issueUserApiKey(
      baseUrl,
      dto.email,
      this.btcpayService.buildBootstrapPermissions(),
      { label: 'PayPay store bootstrap' }
    );

    let store: { id: string } | null = null;
    try {
      store = await this.btcpayService.createStoreWithUserToken(baseUrl, bootstrapKey.apiKey, {
        name: storeName,
        ...(storeWebsite ? { website: storeWebsite } : {})
      });
    } catch (error) {
      await this.safeRevokeKey(baseUrl, bootstrapKey.apiKey);
      this.clearBuffer(bootstrapKey.apiKey);
      throw error;
    }

    let internalKey: { apiKey: string; id?: string } | null = null;
    try {
      if (!store) {
        throw new InternalServerErrorException('BTCPay store creation failed');
      }
      const createdStore = store;
      internalKey = await this.btcpayService.issueUserApiKey(
        baseUrl,
        dto.email,
        this.btcpayService.buildStorePermissions(createdStore.id),
        { label: `PayPay internal ${createdStore.id}` }
      );

      const webhook = await this.btcpayService.registerWebhook(baseUrl, internalKey.apiKey, createdStore.id);
      if (!webhook.secret) {
        throw new InternalServerErrorException('BTCPay webhook secret was not returned');
      }

      const lastFour = this.extractLastFour(internalKey.apiKey);
      const encryptedApiKey = this.encryptionService.encrypt(internalKey.apiKey);
      const encryptedWebhook = this.encryptionService.encrypt(webhook.secret, encryptedApiKey.dekWrapped);

      this.clearBuffer(webhook.secret);

      const result = await this.dataSource.transaction(async (manager) => {
        const tenantRepo = manager.getRepository(TenantEntity);
        const storeRepo = manager.getRepository(StoreEntity);
        const auditRepo = manager.getRepository(AuditLogEntity);

        const tenant = tenantRepo.create({
          email: dto.email,
          name: dto.name
        });
        await tenantRepo.save(tenant);

        const storeEntity = storeRepo.create({
          tenantId: tenant.id,
          btcpayHost: baseUrl,
          btcpayStoreId: createdStore.id,
          storeName,
          storeWebsite: storeWebsite ?? null,
          storeKeyLastFour: lastFour,
          apiKeyCiphertext: encryptedApiKey.ciphertext,
          apiKeyDekWrapped: encryptedApiKey.dekWrapped,
          webhookId: webhook.id,
          webhookSecretCiphertext: encryptedWebhook.ciphertext,
          webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
          walletSetupStatus: 'pending',
          apiKeyManagedByTenant: false
        });
        await storeRepo.save(storeEntity);

        await auditRepo.save({
          tenantId: tenant.id,
          actorId,
          action: 'tenant.created',
          resource: tenant.id,
          result: 'success',
          ip
        });

        await auditRepo.save({
          tenantId: tenant.id,
          actorId,
          action: 'tenant.store.created',
          resource: storeEntity.id,
          result: 'success',
          ip
        });

        return {
          tenantId: tenant.id,
          storeId: storeEntity.id,
          btcpayStoreId: createdStore.id
        } satisfies CreateTenantResult;
      });

      return result;
    } catch (error) {
      if (internalKey?.apiKey) {
        await this.safeRevokeKey(baseUrl, internalKey.apiKey);
      }
      throw error;
    } finally {
      if (this.revokeBootstrapAfterCreate || !store) {
        await this.safeRevokeKey(baseUrl, bootstrapKey.apiKey);
      }
      this.clearBuffer(bootstrapKey.apiKey);
      if (internalKey?.apiKey) {
        this.clearBuffer(internalKey.apiKey);
      }
    }
  }

  async createAdditionalStore(
    tenantId: string,
    dto: CreateStoreDto,
    actorId: string | null,
    ip: string | null,
    requesterEmail: string | null,
    idempotencyKey: string | null
  ) {
    const tenant = await this.requireTenantOwner(tenantId, requesterEmail);
    const primaryStore = await this.storesRepository.findOne({ where: { tenantId }, order: { createdAt: 'ASC' } });
    if (!primaryStore) {
      throw new BadRequestException('Primary store is not available for this tenant.');
    }

    const baseUrl = this.btcpayService.resolveBaseUrl(primaryStore.btcpayHost);
    const storeWebsite = this.sanitizeWebsite(dto.storeWebsite);
    const storeName = this.sanitizeStoreName(dto.storeName);

    const normalizedCurrency = this.normalizeCurrency(dto.defaultCurrency);

    const idempotencyReservation = idempotencyKey
      ? await this.reserveCreateStoreIdempotencyKey(idempotencyKey, tenantId)
      : null;

    if (idempotencyReservation && 'existing' in idempotencyReservation) {
      return idempotencyReservation.existing;
    }

    const existingStore = await this.storesRepository.findOne({
      where: { tenantId, storeName }
    });
    if (existingStore) {
      if (idempotencyReservation && 'record' in idempotencyReservation) {
        await this.cleanupIdempotencyRecord(idempotencyReservation.record);
      }
      throw new ConflictException('Store with this name already exists.');
    }

    const bootstrapKey = await this.btcpayService.issueUserApiKey(
      baseUrl,
      tenant.email,
      this.btcpayService.buildBootstrapPermissions(),
      { label: `PayPay store bootstrap` }
    );

    let store: { id: string } | null = null;
    try {
      store = await this.btcpayService.createStoreWithUserToken(baseUrl, bootstrapKey.apiKey, {
        name: storeName,
        ...(storeWebsite ? { website: storeWebsite } : {}),
        defaultCurrency: normalizedCurrency,
        preferredExchange: this.sanitizePreferredExchange(dto.preferredExchange)
      });

      let internalKey: { apiKey: string; id?: string } | null = null;
      try {
        if (!store) {
          throw new InternalServerErrorException('BTCPay store creation failed');
        }
        const createdStore = store;
        internalKey = await this.btcpayService.issueUserApiKey(
          baseUrl,
          tenant.email,
          this.btcpayService.buildStorePermissions(createdStore.id),
          { label: `PayPay internal ${createdStore.id}` }
        );

        const webhook = await this.btcpayService.registerWebhook(baseUrl, internalKey.apiKey, createdStore.id);
        if (!webhook.secret) {
          throw new InternalServerErrorException('BTCPay webhook secret was not returned');
        }

        const lastFour = this.extractLastFour(internalKey.apiKey);
        const encryptedApiKey = this.encryptionService.encrypt(internalKey.apiKey);
        const encryptedWebhook = this.encryptionService.encrypt(webhook.secret, encryptedApiKey.dekWrapped);

        this.clearBuffer(webhook.secret);

        const result = await this.dataSource.transaction(async (manager) => {
          const storeEntity = manager.getRepository(StoreEntity).create({
            tenantId,
            btcpayHost: baseUrl,
            btcpayStoreId: createdStore.id,
            storeName,
            storeWebsite: storeWebsite ?? null,
            storeKeyLastFour: lastFour,
            apiKeyCiphertext: encryptedApiKey.ciphertext,
            apiKeyDekWrapped: encryptedApiKey.dekWrapped,
            webhookId: webhook.id,
            webhookSecretCiphertext: encryptedWebhook.ciphertext,
            webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
            walletSetupStatus: 'pending',
            apiKeyManagedByTenant: false
          });
          await manager.getRepository(StoreEntity).save(storeEntity);

          await manager.getRepository(AuditLogEntity).save({
            tenantId,
            actorId,
            action: 'tenant.store.created',
            resource: storeEntity.id,
            result: 'success',
            ip
          });

          const result = {
            storeId: storeEntity.id,
            btcpayStoreId: createdStore.id
          };

          if (idempotencyReservation && 'record' in idempotencyReservation) {
            await manager.getRepository(IdempotencyKeyEntity).update(idempotencyReservation.record.key, {
              resourceId: storeEntity.id
            });
            idempotencyReservation.record.resourceId = storeEntity.id;
          }

          return result;
        });

        this.clearBuffer(internalKey.apiKey);
        return result;
      } catch (error) {
        if (internalKey?.apiKey) {
          await this.safeRevokeKey(baseUrl, internalKey.apiKey);
          this.clearBuffer(internalKey.apiKey);
        }
        throw error;
      }
    } finally {
      if (this.revokeBootstrapAfterCreate || !store) {
        await this.safeRevokeKey(baseUrl, bootstrapKey.apiKey);
      }
      this.clearBuffer(bootstrapKey.apiKey);
      if (idempotencyReservation && 'record' in idempotencyReservation && !idempotencyReservation.record.resourceId) {
        await this.cleanupIdempotencyRecord(idempotencyReservation.record);
      }
    }
  }

  async listTenantStores(tenantId: string, requesterEmail: string | null): Promise<TenantStoreSummary[]> {
    await this.requireTenantOwner(tenantId, requesterEmail);
    const stores = await this.storesRepository.find({
      where: { tenantId },
      order: { createdAt: 'ASC' }
    });

    return stores.map((store) => ({
      storeId: store.id,
      btcpayStoreId: store.btcpayStoreId,
      storeName: store.storeName ?? null,
      storeWebsite: store.storeWebsite ?? null,
      storeKeyLastFour: store.storeKeyLastFour ?? null,
      btcpayHost: store.btcpayHost,
      walletSetupStatus: store.walletSetupStatus,
      apiKeyManagedByTenant: store.apiKeyManagedByTenant,
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString()
    }));
  }

  async createInvoice(tenantId: string, dto: CreateTenantInvoiceDto, requesterEmail: string | null) {
    await this.requireTenantOwner(tenantId, requesterEmail);
    const store = await this.storesRepository.findOne({ where: { id: dto.storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const apiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    try {
      const invoice = await this.btcpayService.createInvoice({
        storeId: store.btcpayStoreId,
        host: store.btcpayHost,
        apiKey,
        payload: {
          amount: dto.amount,
          currency: dto.currency,
          metadata: dto.metadata ?? {}
        }
      });
      return {
        invoiceId: invoice.id,
        checkoutLink: invoice.checkoutLink,
        status: invoice.status
      };
    } finally {
      this.clearBuffer(apiKey);
    }
  }

  async getStoreSettings(
    tenantId: string,
    storeId: string,
    requesterEmail: string | null
  ): Promise<StoreSettingsResult> {
    await this.requireTenantOwner(tenantId, requesterEmail);
    const store = await this.storesRepository.findOne({ where: { id: storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    let storeName = store.storeName ?? null;
    let storeWebsite = store.storeWebsite ?? null;
    const apiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    try {
      const remote = await this.btcpayService.getStore(store.btcpayHost, apiKey, store.btcpayStoreId);
      if (remote && typeof remote === 'object') {
        const remoteName = (remote as { name?: string }).name;
        if (typeof remoteName === 'string' && remoteName.trim().length > 0) {
          storeName = remoteName;
        }
        const remoteWebsite = this.sanitizeWebsite((remote as { website?: string }).website ?? undefined);
        if (remoteWebsite) {
          storeWebsite = remoteWebsite;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to refresh store ${store.btcpayStoreId} metadata from BTCPay`,
        (error as Error).message
      );
    } finally {
      this.clearBuffer(apiKey);
    }

    return {
      storeId: store.id,
      btcpayStoreId: store.btcpayStoreId,
      storeName,
      storeWebsite,
      btcpayHost: store.btcpayHost,
      walletSetupStatus: store.walletSetupStatus,
      storeKeyLastFour: store.storeKeyLastFour ?? null,
      apiKeyManagedByTenant: store.apiKeyManagedByTenant
    } satisfies StoreSettingsResult;
  }

  async rotateStoreApiKey(
    tenantId: string,
    storeId: string,
    actorId: string | null,
    requesterEmail: string | null
  ) {
    const store = await this.storesRepository.findOne({ where: { id: storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    if (store.apiKeyManagedByTenant) {
      throw new ForbiddenException(
        'Store API key rotation is not available for merchant-managed credentials. Update the key from BTCPay and resync.'
      );
    }

    const tenant = await this.requireTenantOwner(tenantId, requesterEmail);

    const baseUrl = this.btcpayService.resolveBaseUrl(store.btcpayHost);
    const oldApiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);

    let newApiKeyPlain: string | null = null;
    try {
      const tenantStores = await this.storesRepository.find({ where: { tenantId } });

      const storesSharingKey = tenantStores.filter((candidate) => {
        if (candidate.apiKeyManagedByTenant) {
          return false;
        }
        if (candidate.id === store.id) {
          return true;
        }
        const candidateKey = this.encryptionService.decrypt(
          candidate.apiKeyCiphertext,
          candidate.apiKeyDekWrapped
        );
        try {
          return candidateKey === oldApiKey;
        } finally {
          this.clearBuffer(candidateKey);
        }
      });

      if (storesSharingKey.length === 0) {
        storesSharingKey.push(store);
      }

      const issuedKey = await this.btcpayService.issueUserApiKey(
        baseUrl,
        tenant.email,
        this.btcpayService.buildStorePermissions(store.btcpayStoreId),
        { label: `PayPay internal ${store.btcpayStoreId}` }
      );

      newApiKeyPlain = issuedKey.apiKey;
      await this.btcpayService.probeStoreInvoices(baseUrl, newApiKeyPlain, store.btcpayStoreId);

      const lastFour = this.extractLastFour(newApiKeyPlain);

      await Promise.all(
        storesSharingKey.map(async (candidate) => {
          const encryptedApiKey = this.encryptionService.encrypt(newApiKeyPlain!);
          const webhook = await this.resolveStoreWebhookSecret(
            baseUrl,
            candidate,
            newApiKeyPlain!
          );
          try {
            const encryptedWebhook = this.encryptionService.encrypt(
              webhook.secret,
              encryptedApiKey.dekWrapped
            );
            await this.storesRepository.update(candidate.id, {
              apiKeyCiphertext: encryptedApiKey.ciphertext,
              apiKeyDekWrapped: encryptedApiKey.dekWrapped,
              webhookId: webhook.webhookId,
              webhookSecretCiphertext: encryptedWebhook.ciphertext,
              webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
              storeKeyLastFour: lastFour
            });
          } finally {
            this.clearBuffer(webhook.secret);
          }
        })
      );

      await this.auditRepository.save({
        tenantId,
        actorId,
        action: 'tenant.store.key.rotated',
        resource: store.id,
        result: 'success',
        ip: null
      });

      await this.safeRevokeKey(baseUrl, oldApiKey);

      this.clearBuffer(issuedKey.apiKey);
      return { lastFour };
    } catch (error) {
      if (newApiKeyPlain) {
        await this.safeRevokeKey(baseUrl, newApiKeyPlain);
      }
      throw error;
    } finally {
      this.clearBuffer(oldApiKey);
      this.clearBuffer(newApiKeyPlain);
    }
  }

  async deleteStore(
    tenantId: string,
    storeId: string,
    actorId: string | null,
    ip: string | null,
    requesterEmail: string | null
  ): Promise<void> {
    const tenant = await this.requireTenantOwner(tenantId, requesterEmail);
    const store = await this.storesRepository.findOne({ where: { id: storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const baseUrl = this.btcpayService.resolveBaseUrl(store.btcpayHost);
    const internalKey = store.apiKeyManagedByTenant
      ? null
      : this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);

    const temporaryKey = await this.btcpayService.issueUserApiKey(
      baseUrl,
      tenant.email,
      [
        `btcpay.store.canmodifystoresettings:${store.btcpayStoreId}`,
        `btcpay.store.webhooks.canmodifywebhooks:${store.btcpayStoreId}`
      ],
      { label: `PayPay temp ${store.btcpayStoreId} delete` }
    );

    try {
      await this.tryDeleteWebhook(baseUrl, store, internalKey ?? temporaryKey.apiKey);
      await this.tryDeleteStore(baseUrl, temporaryKey.apiKey, store.btcpayStoreId);
    } finally {
      await this.safeRevokeKey(baseUrl, temporaryKey.apiKey);
      if (!store.apiKeyManagedByTenant) {
        await this.safeRevokeKey(baseUrl, internalKey);
      }
      this.clearBuffer(internalKey);
      this.clearBuffer(temporaryKey.apiKey);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(StoreEntity).delete(store.id);
      await manager.getRepository(AuditLogEntity).save({
        tenantId,
        actorId,
        action: 'tenant.store.deleted',
        resource: store.id,
        result: 'success',
        ip
      });
    });
  }

  async registerWebhookDelivery(tenantId: string | null, deliveryId: string, resourceId: string | null) {
    const exists = await this.idempotencyRepository.findOne({ where: { key: deliveryId } });
    if (exists) {
      return false;
    }
    try {
      await this.idempotencyRepository.insert({
        key: deliveryId,
        tenantId,
        source: 'btcpay_webhook',
        resourceId
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return false;
      }
      throw error;
    }
  }

  private normalizeCurrency(value: string): string {
    if (!value) {
      throw new BadRequestException('Default currency is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Default currency is required.');
    }
    return trimmed.toUpperCase();
  }

  private sanitizePreferredExchange(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private clearBuffer(value: string | Buffer | null | undefined) {
    if (!value) {
      return;
    }
    if (Buffer.isBuffer(value)) {
      value.fill(0);
      return;
    }
    try {
      const buffer = Buffer.from(value, 'utf8');
      buffer.fill(0);
    } catch {
      // best-effort clearing; ignore failures
    }
  }

  private isTruthy(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private sanitizeWebsite(website?: string | null): string | undefined {
    if (!website) {
      return undefined;
    }
    const trimmed = website.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async safeRevokeKey(baseUrl: string, key: string | null | undefined): Promise<void> {
    if (!key) {
      return;
    }
    try {
      await this.btcpayService.revokeUserApiKey(baseUrl, key);
    } catch (error) {
      const suffix = this.extractLastFour(key);
      this.logger.warn(
        `Failed to revoke BTCPay API key${suffix ? ` ****${suffix}` : ''}: ${(error as Error).message}`
      );
    }
  }

  private sanitizeStoreName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Store name is required.');
    }
    return trimmed;
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

  private async requireTenantOwner(tenantId: string, requesterEmail: string | null): Promise<TenantEntity> {
    const tenant = await this.tenantsRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (!requesterEmail) {
      throw new ForbiddenException('Tenant access denied');
    }
    const expected = normalizeEmail(tenant.email);
    const received = normalizeEmail(requesterEmail);
    if (expected !== received) {
      throw new ForbiddenException('Tenant access denied');
    }
    return tenant;
  }

  private async tryDeleteWebhook(baseUrl: string, store: StoreEntity, apiKey: string): Promise<void> {
    if (!store.webhookId) {
      return;
    }
    try {
      await this.btcpayService.deleteWebhook(baseUrl, apiKey, store.btcpayStoreId, store.webhookId);
    } catch (error) {
      this.logger.warn(
        `Unable to delete webhook ${store.webhookId} for store ${store.btcpayStoreId}: ${(error as Error).message}`
      );
    }
  }

  private async resolveStoreWebhookSecret(
    baseUrl: string,
    store: StoreEntity,
    apiKey: string
  ): Promise<{ secret: string; webhookId: string }> {
    if (store.webhookSecretCiphertext && store.webhookSecretDekWrapped) {
      try {
        const secret = this.encryptionService.decrypt(
          store.webhookSecretCiphertext,
          store.webhookSecretDekWrapped
        );
        if (secret.trim().length > 0 && store.webhookId) {
          return { secret, webhookId: store.webhookId };
        }
        this.clearBuffer(secret);
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt webhook secret for store ${store.id}, attempting re-registration: ${(error as Error).message}`
        );
      }
    }

    await this.tryDeleteWebhook(baseUrl, store, apiKey);
    const webhook = await this.btcpayService.registerWebhook(baseUrl, apiKey, store.btcpayStoreId);
    if (!webhook.secret) {
      throw new InternalServerErrorException('BTCPay webhook secret was not returned');
    }
    return { secret: webhook.secret, webhookId: webhook.id };
  }

  private async tryDeleteStore(baseUrl: string, apiKey: string, storeId: string): Promise<void> {
    try {
      await this.btcpayService.deleteStore(baseUrl, apiKey, storeId);
    } catch (error) {
      this.logger.warn(
        `Unable to delete BTCPay store ${storeId}: ${(error as Error).message}`
      );
    }
  }

  private async reserveCreateStoreIdempotencyKey(
    key: string,
    tenantId: string
  ): Promise<
    | { record: IdempotencyKeyEntity }
    | { existing: { storeId: string; btcpayStoreId: string } }
  > {
    const source = 'tenant.store.create';
    try {
      const record = this.idempotencyRepository.create({
        key,
        tenantId,
        source,
        resourceId: null
      });
      await this.idempotencyRepository.insert(record);
      return { record };
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') {
        throw error;
      }

      const existing = await this.idempotencyRepository.findOne({ where: { key } });
      if (!existing) {
        throw new ConflictException('Idempotency key already used.');
      }
      if (existing.source !== source || existing.tenantId !== tenantId) {
        throw new ConflictException('Idempotency key already used for another resource.');
      }
      if (!existing.resourceId) {
        throw new ConflictException('Another request with this Idempotency-Key is still being processed.');
      }
      const store = await this.storesRepository.findOne({ where: { id: existing.resourceId, tenantId } });
      if (!store) {
        throw new ConflictException('Idempotency key result is unavailable.');
      }
      return {
        existing: {
          storeId: store.id,
          btcpayStoreId: store.btcpayStoreId
        }
      };
    }
  }

  private async cleanupIdempotencyRecord(record: IdempotencyKeyEntity): Promise<void> {
    try {
      await this.idempotencyRepository.delete(record.key);
    } catch (error) {
      this.logger.warn(
        `Failed to clean up idempotency key ${record.key}: ${(error as Error).message}`
      );
    }
  }
}
