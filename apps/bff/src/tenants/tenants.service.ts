import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
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

interface CreateTenantResult {
  tenantId: string;
  storeId: string;
  btcpayStoreId: string;
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
        name: dto.storeName
      });
    } catch (error) {
      await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
      this.clearBuffer(temporaryKey.apiKey);
      throw error;
    }

    await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
    this.clearBuffer(temporaryKey.apiKey);

    try {
      const apiKey = await this.btcpayService.createUserApiKey(baseUrl, dto.email, store.id, dto.includePullPayments ?? false);
      const webhook = await this.btcpayService.registerWebhook(baseUrl, apiKey.apiKey, store.id);
      if (!webhook.secret) {
        throw new InternalServerErrorException('BTCPay webhook secret was not returned');
      }

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

  async createAdditionalStore(tenantId: string, dto: CreateStoreDto, actorId: string | null, ip: string | null) {
    const tenant = await this.tenantsRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const primaryStore = await this.storesRepository.findOne({ where: { tenantId }, order: { createdAt: 'ASC' } });
    const baseUrl = this.btcpayService.resolveBaseUrl(dto.btcpayHost ?? primaryStore?.btcpayHost);

    const temporaryKey = await this.btcpayService.createUserApiKeyUnscoped(
      baseUrl,
      tenant.email,
      TenantsService.TEMPORARY_STORE_PERMISSION,
      'Temp store setup'
    );

    let store: { id: string };
    try {
      store = await this.btcpayService.createStoreWithUserToken(baseUrl, temporaryKey.apiKey, { name: dto.storeName });
    } catch (error) {
      await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
      this.clearBuffer(temporaryKey.apiKey);
      throw error;
    }

    await this.safeDeleteTemporaryKey(baseUrl, temporaryKey.apiKey);
    this.clearBuffer(temporaryKey.apiKey);

    const apiKey = await this.btcpayService.createUserApiKey(baseUrl, tenant.email, store.id, dto.includePullPayments ?? false);
    const webhook = await this.btcpayService.registerWebhook(baseUrl, apiKey.apiKey, store.id);
    if (!webhook.secret) {
      throw new InternalServerErrorException('BTCPay webhook secret was not returned');
    }

    const encryptedApiKey = this.encryptionService.encrypt(apiKey.apiKey);
    const encryptedWebhook = this.encryptionService.encrypt(webhook.secret, encryptedApiKey.dekWrapped);

    this.clearBuffer(apiKey.apiKey);
    this.clearBuffer(webhook.secret);

    return this.dataSource.transaction(async (manager) => {
      const storeEntity = manager.getRepository(StoreEntity).create({
        tenantId,
        btcpayHost: baseUrl,
        btcpayStoreId: store.id,
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

  async createInvoice(tenantId: string, dto: CreateTenantInvoiceDto) {
    const store = await this.storesRepository.findOne({ where: { id: dto.storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const apiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    try {
      const invoice = await this.btcpayService.createInvoice(store.btcpayHost, apiKey, store.btcpayStoreId, {
        amount: dto.amount,
        currency: dto.currency,
        metadata: dto.metadata ?? {}
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

  async rotateStoreApiKey(tenantId: string, storeId: string, actorId: string | null) {
    const store = await this.storesRepository.findOne({ where: { id: storeId, tenantId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const tenant = await this.tenantsRepository.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const oldApiKey = this.encryptionService.decrypt(store.apiKeyCiphertext, store.apiKeyDekWrapped);
    const webhookSecret = this.encryptionService.decrypt(store.webhookSecretCiphertext, store.webhookSecretDekWrapped);

    try {
      const apiKey = await this.btcpayService.createUserApiKey(store.btcpayHost, tenant.email, store.btcpayStoreId, false);
      const encryptedApiKey = this.encryptionService.encrypt(apiKey.apiKey);
      const encryptedWebhook = this.encryptionService.encrypt(webhookSecret, encryptedApiKey.dekWrapped);

      await this.storesRepository.update(store.id, {
        apiKeyCiphertext: encryptedApiKey.ciphertext,
        apiKeyDekWrapped: encryptedApiKey.dekWrapped,
        webhookSecretCiphertext: encryptedWebhook.ciphertext,
        webhookSecretDekWrapped: encryptedWebhook.dekWrapped
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

      const lastFour = apiKey.apiKey.slice(-4);
      this.clearBuffer(apiKey.apiKey);
      return { lastFour };
    } finally {
      this.clearBuffer(oldApiKey);
      this.clearBuffer(webhookSecret);
    }
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

  private clearBuffer(value: string | null | undefined) {
    if (!value) {
      return;
    }
    try {
      const buf = Buffer.from(value);
      buf.fill(0);
    } catch (error) {
      this.logger.warn('Failed to clear buffer', error as Error);
    }
  }

  private async safeDeleteTemporaryKey(baseUrl: string, apiKey: string) {
    try {
      await this.btcpayService.deleteApiKey(baseUrl, apiKey);
    } catch (error) {
      this.logger.warn('Failed to revoke temporary BTCPay API key', error as Error);
    }
  }
}
