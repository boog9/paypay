import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name, { timestamp: false });
  private static readonly TEMPORARY_STORE_PERMISSION = ['btcpay.store.canmodifystoresettings'];

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
    private readonly dataSource: DataSource
  ) {}

  async createTenant(dto: CreateTenantDto, actorId: string | null, ip: string | null): Promise<CreateTenantResult> {
    const baseUrl = this.btcpayService.resolveBaseUrl(dto.btcpayHost);
    const storeWebsite = this.sanitizeWebsite(dto.storeWebsite);
    await this.btcpayService.createUser(baseUrl, {
      email: dto.email,
      name: dto.name,
      sendInvitationEmail: true
    });

    const temporaryKey = await this.btcpayService.createUserApiKeyUnscoped(
      baseUrl,
      dto.email,
      TenantsService.TEMPORARY_STORE_PERMISSION,
      'Temp store setup'
    );

    let store: { id: string };
    try {
      store = await this.btcpayService.createStoreWithUserToken(baseUrl, temporaryKey.apiKey, {
        name: dto.storeName,
        ...(storeWebsite ? { website: storeWebsite } : {})
      });
    } catch (error) {
      await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
      this.clearBuffer(temporaryKey.apiKey);
      throw error;
    }

    await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
    this.clearBuffer(temporaryKey.apiKey);

    try {
      const apiKey = await this.btcpayService.createUserApiKey(baseUrl, dto.email, store.id);
      const webhook = await this.btcpayService.registerWebhook(baseUrl, apiKey.apiKey, store.id);
      if (!webhook.secret) {
        throw new InternalServerErrorException('BTCPay webhook secret was not returned');
      }

      const lastFour = this.extractLastFour(apiKey.apiKey);
      const encryptedApiKey = this.encryptionService.encrypt(apiKey.apiKey);
      const encryptedWebhook = this.encryptionService.encrypt(webhook.secret, encryptedApiKey.dekWrapped);

      this.clearBuffer(apiKey.apiKey);
      this.clearBuffer(webhook.secret);

      return this.dataSource.transaction(async (manager) => {
        const tenant = manager.getRepository(TenantEntity).create({
          email: dto.email,
          name: dto.name
        });
        await manager.getRepository(TenantEntity).save(tenant);

        const storeEntity = manager.getRepository(StoreEntity).create({
          tenantId: tenant.id,
          btcpayHost: baseUrl,
          btcpayStoreId: store.id,
          storeName: dto.storeName,
          storeWebsite: storeWebsite ?? null,
          storeKeyLastFour: lastFour,
          apiKeyCiphertext: encryptedApiKey.ciphertext,
          apiKeyDekWrapped: encryptedApiKey.dekWrapped,
          webhookId: webhook.id,
          webhookSecretCiphertext: encryptedWebhook.ciphertext,
          webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
          walletSetupStatus: 'pending'
        });
        await manager.getRepository(StoreEntity).save(storeEntity);

        await manager.getRepository(AuditLogEntity).save({
          tenantId: tenant.id,
          actorId,
          action: 'tenant.created',
          resource: storeEntity.id,
          result: 'success',
          ip
        });

        return {
          tenantId: tenant.id,
          storeId: storeEntity.id,
          btcpayStoreId: store.id
        } satisfies CreateTenantResult;
      });
    } catch (error) {
      this.logger.error('Failed to onboard tenant', (error as Error).message);
      throw error;
    }
  }

  async createAdditionalStore(
    tenantId: string,
    dto: CreateStoreDto,
    actorId: string | null,
    ip: string | null,
    requesterEmail: string | null
  ) {
    const tenant = await this.requireTenantOwner(tenantId, requesterEmail);
    const primaryStore = await this.storesRepository.findOne({ where: { tenantId }, order: { createdAt: 'ASC' } });
    const baseUrl = this.btcpayService.resolveBaseUrl(dto.btcpayHost ?? primaryStore?.btcpayHost);
    const storeWebsite = this.sanitizeWebsite(dto.storeWebsite);

    const temporaryKey = await this.btcpayService.createUserApiKeyUnscoped(
      baseUrl,
      tenant.email,
      TenantsService.TEMPORARY_STORE_PERMISSION,
      'Temp store setup'
    );

    let store: { id: string };
    try {
      store = await this.btcpayService.createStoreWithUserToken(baseUrl, temporaryKey.apiKey, {
        name: dto.storeName,
        ...(storeWebsite ? { website: storeWebsite } : {})
      });
    } catch (error) {
      await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
      this.clearBuffer(temporaryKey.apiKey);
      throw error;
    }

    await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
    this.clearBuffer(temporaryKey.apiKey);

    const apiKey = await this.btcpayService.createUserApiKey(baseUrl, tenant.email, store.id);
    const webhook = await this.btcpayService.registerWebhook(baseUrl, apiKey.apiKey, store.id);
    if (!webhook.secret) {
      throw new InternalServerErrorException('BTCPay webhook secret was not returned');
    }

    const lastFour = this.extractLastFour(apiKey.apiKey);
    const encryptedApiKey = this.encryptionService.encrypt(apiKey.apiKey);
    const encryptedWebhook = this.encryptionService.encrypt(webhook.secret, encryptedApiKey.dekWrapped);

    this.clearBuffer(apiKey.apiKey);
    this.clearBuffer(webhook.secret);

    return this.dataSource.transaction(async (manager) => {
      const storeEntity = manager.getRepository(StoreEntity).create({
        tenantId,
        btcpayHost: baseUrl,
        btcpayStoreId: store.id,
        storeName: dto.storeName,
        storeWebsite: storeWebsite ?? null,
        storeKeyLastFour: lastFour,
        apiKeyCiphertext: encryptedApiKey.ciphertext,
        apiKeyDekWrapped: encryptedApiKey.dekWrapped,
        webhookId: webhook.id,
        webhookSecretCiphertext: encryptedWebhook.ciphertext,
        webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
        walletSetupStatus: 'pending'
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

      return {
        storeId: storeEntity.id,
        btcpayStoreId: store.id
      };
    });
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
      storeKeyLastFour: store.storeKeyLastFour ?? null
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

    const tenant = await this.requireTenantOwner(tenantId, requesterEmail);

    const oldApiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    const webhookSecret = this.encryptionService.decrypt(store.webhookSecretCiphertext, store.webhookSecretDekWrapped);

    try {
      const apiKey = await this.btcpayService.createUserApiKey(store.btcpayHost, tenant.email, store.btcpayStoreId);
      const lastFour = this.extractLastFour(apiKey.apiKey);
      const encryptedApiKey = this.encryptionService.encrypt(apiKey.apiKey);
      const encryptedWebhook = this.encryptionService.encrypt(webhookSecret, encryptedApiKey.dekWrapped);

      await this.storesRepository.update(store.id, {
        apiKeyCiphertext: encryptedApiKey.ciphertext,
        apiKeyDekWrapped: encryptedApiKey.dekWrapped,
        webhookSecretCiphertext: encryptedWebhook.ciphertext,
        webhookSecretDekWrapped: encryptedWebhook.dekWrapped,
        storeKeyLastFour: lastFour
      });

      await this.auditRepository.save({
        tenantId,
        actorId,
        action: 'tenant.store.apiKeyRotated',
        resource: store.id,
        result: 'success',
        ip: null
      });

      await this.btcpayService.deleteApiKey(store.btcpayHost, oldApiKey);

      this.clearBuffer(apiKey.apiKey);
      return { lastFour };
    } finally {
      this.clearBuffer(oldApiKey);
      this.clearBuffer(webhookSecret);
    }
  }

  async deleteStore(
    tenantId: string,
    storeId: string,
    actorId: string | null,
    ip: string | null,
    requesterEmail: string | null
  ): Promise<void> {
    await this.requireTenantOwner(tenantId, requesterEmail);
    const store = await this.storesRepository.findOne({ where: { id: storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const apiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    try {
      await this.tryDeleteWebhook(store, apiKey);
      await this.tryDeleteStore(store, apiKey);
    } finally {
      await this.tryRevokeStoreApiKey(store, apiKey);
      this.clearBuffer(apiKey);
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

  private sanitizeWebsite(website?: string | null): string | undefined {
    if (!website) {
      return undefined;
    }
    const trimmed = website.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

  private async tryDeleteWebhook(store: StoreEntity, apiKey: string): Promise<void> {
    if (!store.webhookId) {
      return;
    }
    try {
      await this.btcpayService.deleteWebhook(store.btcpayHost, apiKey, store.btcpayStoreId, store.webhookId);
    } catch (error) {
      this.logger.warn(
        `Unable to delete webhook ${store.webhookId} for store ${store.btcpayStoreId}: ${(error as Error).message}`
      );
    }
  }

  private async tryDeleteStore(store: StoreEntity, apiKey: string): Promise<void> {
    try {
      await this.btcpayService.deleteStore(store.btcpayHost, apiKey, store.btcpayStoreId);
    } catch (error) {
      this.logger.warn(
        `Unable to delete BTCPay store ${store.btcpayStoreId}: ${(error as Error).message}`
      );
    }
  }

  private async tryRevokeStoreApiKey(store: StoreEntity, apiKey: string): Promise<void> {
    try {
      await this.btcpayService.deleteApiKey(store.btcpayHost, apiKey);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`BTCPay API key already revoked for store ${store.btcpayStoreId}`);
        return;
      }
      this.logger.warn(
        `Failed to revoke BTCPay API key for store ${store.btcpayStoreId}: ${(error as Error).message}`
      );
    }
  }

  private async safeDeleteTemporaryKey(baseUrl: string, apiKey: string) {
    try {
      await this.btcpayService.deleteApiKey(baseUrl, apiKey);
    } catch (error) {
      this.logger.warn(`Failed to revoke temporary BTCPay API key: ${(error as Error).message}`);
    }
  }
}
