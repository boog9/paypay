import { DataSource } from 'typeorm';
import { TenantsService } from '../src/tenants/tenants.service';
import { TenantEntity } from '../src/tenants/entities/tenant.entity';
import { StoreEntity } from '../src/tenants/entities/store.entity';
import { AuditLogEntity } from '../src/tenants/entities/audit-log.entity';
import { IdempotencyKeyEntity } from '../src/tenants/entities/idempotency-key.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';
import { ConfigService } from '@nestjs/config';

describe('TenantsService onboarding flows', () => {
  function createService() {
    const tenantsRepository = {
      findOne: jest.fn()
    } as unknown as jest.Mocked<any>;
    const storesRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<any>;
    const auditRepository = {
      save: jest.fn()
    } as unknown as jest.Mocked<any>;
    const idempotencyRepository = {
      create: jest.fn((payload) => ({ ...payload })),
      insert: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<any>;

    const encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn()
    } as unknown as jest.Mocked<EnvelopeEncryptionService>;

    const btcpayService = {
      resolveBaseUrl: jest.fn((host?: string) => host ?? 'https://btcpay.test'),
      createUser: jest.fn().mockResolvedValue({ id: 'user-1', email: 'merchant@example.com' }),
      createStoreWithUserToken: jest.fn().mockResolvedValue({ id: 'btcpay-store-id' }),
      issueUserApiKey: jest.fn().mockResolvedValue({ apiKey: 'store-key', id: 'key-id', permissions: [] }),
      registerWebhook: jest.fn().mockResolvedValue({ id: 'webhook-id', secret: 'webhook-secret' }),
      deleteWebhook: jest.fn().mockResolvedValue(undefined),
      deleteStore: jest.fn().mockResolvedValue(undefined),
      revokeUserApiKey: jest.fn().mockResolvedValue(undefined),
      probeStoreInvoices: jest.fn().mockResolvedValue(undefined),
      buildStorePermissions: jest
        .fn()
        .mockImplementation((storeId: string) => [
          `btcpay.store.cancreateinvoice:${storeId}`,
          `btcpay.store.canviewinvoices:${storeId}`,
          `btcpay.store.canmodifyinvoices:${storeId}`,
          `btcpay.store.canviewstoresettings:${storeId}`,
          `btcpay.store.webhooks.canmodifywebhooks:${storeId}`
        ]),
      buildBootstrapPermissions: jest.fn().mockReturnValue(['btcpay.store.canmodifystoresettings'])
    } as unknown as jest.Mocked<BtcpayService>;

    const configService = {
      get: jest.fn().mockReturnValue('true')
    } as unknown as jest.Mocked<ConfigService>;

    const tenantRepoInTx = {
      create: jest.fn((payload) => ({ id: 'tenant-entity-id', ...payload })),
      save: jest.fn().mockImplementation(async (entity) => entity)
    };
    const storeRepoInTx = {
      create: jest.fn((payload) => ({ id: 'store-entity-id', ...payload })),
      save: jest.fn().mockImplementation(async (entity) => entity),
      delete: jest.fn().mockResolvedValue(undefined)
    };
    const auditRepoInTx = {
      save: jest.fn().mockResolvedValue(undefined)
    };
    const idempotencyRepoInTx = {
      update: jest.fn().mockResolvedValue(undefined)
    };

    type TestEntityManager = {
      getRepository: jest.Mock;
    };

    const manager: TestEntityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === TenantEntity) return tenantRepoInTx;
        if (entity === StoreEntity) return storeRepoInTx;
        if (entity === AuditLogEntity) return auditRepoInTx;
        if (entity === IdempotencyKeyEntity) return idempotencyRepoInTx;
        throw new Error('Unexpected repository request');
      })
    };

    const dataSource = {
      transaction: jest.fn(async (callback: (manager: TestEntityManager) => Promise<any>) => callback(manager))
    } as unknown as DataSource;

    const service = new TenantsService(
      tenantsRepository,
      storesRepository,
      auditRepository,
      idempotencyRepository,
      encryptionService,
      btcpayService,
      dataSource,
      configService
    );

    return {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      dataSource,
      auditRepository,
      tenantRepoInTx,
      storeRepoInTx,
      auditRepoInTx,
      configService,
      idempotencyRepository,
      idempotencyRepoInTx
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates tenants with scoped BTCPay credentials managed by the backend', async () => {
    const {
      service,
      encryptionService,
      btcpayService,
      dataSource,
      tenantRepoInTx,
      storeRepoInTx,
      auditRepoInTx
    } = createService();

    (btcpayService.issueUserApiKey as jest.Mock)
      .mockResolvedValueOnce({ apiKey: 'bootstrap-key', permissions: ['btcpay.store.canmodifystoresettings'] })
      .mockResolvedValueOnce({ apiKey: 'store-key-1234', permissions: [] });

    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'api-cipher', dekWrapped: 'api-dek' });
    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'webhook-cipher', dekWrapped: 'webhook-dek' });

    const result = await service.createTenant(
      {
        email: 'merchant@example.com',
        name: 'Merchant',
        storeName: 'Demo Store',
        btcpayHost: 'https://btcpay.custom'
      },
      'actor-1',
      '127.0.0.1'
    );

    expect(btcpayService.createUser).toHaveBeenCalledWith('https://btcpay.custom', {
      email: 'merchant@example.com',
      name: 'Merchant',
      sendInvitationEmail: true
    });
    expect(btcpayService.issueUserApiKey).toHaveBeenNthCalledWith(
      1,
      'https://btcpay.custom',
      'merchant@example.com',
      ['btcpay.store.canmodifystoresettings'],
      { label: 'PayPay store bootstrap' }
    );
    expect(btcpayService.createStoreWithUserToken).toHaveBeenCalledWith('https://btcpay.custom', 'bootstrap-key', {
      name: 'Demo Store'
    });
    expect(btcpayService.issueUserApiKey).toHaveBeenNthCalledWith(
      2,
      'https://btcpay.custom',
      'merchant@example.com',
      expect.arrayContaining([
        'btcpay.store.cancreateinvoice:btcpay-store-id',
        'btcpay.store.canviewstoresettings:btcpay-store-id'
      ]),
      { label: 'PayPay internal btcpay-store-id' }
    );
    expect(btcpayService.registerWebhook).toHaveBeenCalledWith(
      'https://btcpay.custom',
      'store-key-1234',
      'btcpay-store-id'
    );
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.custom', 'bootstrap-key');

    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(1, 'store-key-1234');
    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(2, 'webhook-secret', 'api-dek');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(tenantRepoInTx.create).toHaveBeenCalled();
    expect(storeRepoInTx.create).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyManagedByTenant: false, storeKeyLastFour: '1234' })
    );
    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.created', actorId: 'actor-1' })
    );
    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.created', actorId: 'actor-1' })
    );

    expect(result).toEqual({
      tenantId: 'tenant-entity-id',
      storeId: 'store-entity-id',
      btcpayStoreId: 'btcpay-store-id'
    });
  });

  it('creates additional stores by issuing scoped BTCPay credentials', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      dataSource,
      storeRepoInTx,
      auditRepoInTx
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    storesRepository.findOne
      .mockResolvedValueOnce({
        btcpayHost: 'https://btcpay.test'
      })
      .mockResolvedValueOnce(null);

    (btcpayService.issueUserApiKey as jest.Mock)
      .mockResolvedValueOnce({ apiKey: 'bootstrap-key', permissions: ['btcpay.store.canmodifystoresettings'] })
      .mockResolvedValueOnce({ apiKey: 'store-key-9876', permissions: [] });

    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'api-cipher', dekWrapped: 'api-dek' });
    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'webhook-cipher', dekWrapped: 'webhook-dek' });

    const result = await service.createAdditionalStore(
      'tenant-entity-id',
      {
        storeName: 'Second Store',
        defaultCurrency: 'USD'
      },
      'actor-2',
      '127.0.0.1',
      'merchant@example.com',
      null
    );

    expect(btcpayService.createUser).not.toHaveBeenCalled();
    expect(btcpayService.issueUserApiKey).toHaveBeenNthCalledWith(
      1,
      'https://btcpay.test',
      'merchant@example.com',
      ['btcpay.store.canmodifystoresettings'],
      { label: 'PayPay store bootstrap' }
    );
    expect(btcpayService.createStoreWithUserToken).toHaveBeenCalledWith(
      'https://btcpay.test',
      'bootstrap-key',
      expect.objectContaining({ name: 'Second Store', defaultCurrency: 'USD' })
    );
    expect(btcpayService.issueUserApiKey).toHaveBeenNthCalledWith(
      2,
      'https://btcpay.test',
      'merchant@example.com',
      expect.arrayContaining([
        'btcpay.store.cancreateinvoice:btcpay-store-id',
        'btcpay.store.canviewstoresettings:btcpay-store-id'
      ]),
      { label: 'PayPay internal btcpay-store-id' }
    );
    expect(btcpayService.registerWebhook).toHaveBeenCalledWith('https://btcpay.test', 'store-key-9876', 'btcpay-store-id');
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.test',
      'bootstrap-key',
      expect.objectContaining({ action: 'createAdditionalStore.cleanup.bootstrap' })
    );

    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(1, 'store-key-9876');
    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(2, 'webhook-secret', 'api-dek');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(storeRepoInTx.create).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyManagedByTenant: false, storeKeyLastFour: '9876' })
    );
    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.created', actorId: 'actor-2' })
    );

    expect(result).toEqual({ storeId: 'store-entity-id', btcpayStoreId: 'btcpay-store-id' });
  });

  it('propagates the idempotency key as correlation id when revoking bootstrap credentials', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      dataSource,
      storeRepoInTx,
      auditRepoInTx
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    storesRepository.findOne
      .mockResolvedValueOnce({
        btcpayHost: 'https://btcpay.test'
      })
      .mockResolvedValueOnce(null);

    (btcpayService.issueUserApiKey as jest.Mock)
      .mockResolvedValueOnce({ apiKey: 'bootstrap-key', permissions: ['btcpay.store.canmodifystoresettings'] })
      .mockResolvedValueOnce({ apiKey: 'store-key-1234', permissions: [] });

    (btcpayService.registerWebhook as jest.Mock).mockResolvedValue({ id: 'webhook-id', secret: 'webhook-secret' });
    (encryptionService.encrypt as jest.Mock)
      .mockReturnValueOnce({ ciphertext: 'api-cipher', dekWrapped: 'api-dek' })
      .mockReturnValueOnce({ ciphertext: 'webhook-cipher', dekWrapped: 'webhook-dek' });

    await service.createAdditionalStore(
      'tenant-entity-id',
      {
        storeName: 'Second Store',
        defaultCurrency: 'USD'
      },
      'actor-2',
      '127.0.0.1',
      'merchant@example.com',
      'IDEMP-123'
    );

    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.test',
      'bootstrap-key',
      expect.objectContaining({
        correlationId: 'IDEMP-123',
        action: 'createAdditionalStore.cleanup.bootstrap'
      })
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(storeRepoInTx.create).toHaveBeenCalled();
    expect(auditRepoInTx.save).toHaveBeenCalled();
  });

  it('rotates store API keys by issuing a new scoped credential and revoking the previous one', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      auditRepository
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    const primaryStore = {
      id: 'store-entity-id',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id',
      apiKeyCiphertext: 'cipher-old',
      apiKeyDekWrapped: 'dek-old',
      webhookId: 'webhook-id',
      webhookSecretCiphertext: 'webhook-cipher',
      webhookSecretDekWrapped: 'webhook-dek'
    };
    const siblingStore = {
      id: 'store-entity-id-2',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id-2',
      apiKeyCiphertext: 'cipher-old-2',
      apiKeyDekWrapped: 'dek-old-2',
      webhookId: 'webhook-id',
      webhookSecretCiphertext: 'webhook-cipher-2',
      webhookSecretDekWrapped: 'webhook-dek-2',
      apiKeyManagedByTenant: false
    };

    storesRepository.findOne.mockResolvedValue(primaryStore);
    storesRepository.find.mockResolvedValue([primaryStore, siblingStore]);

    (encryptionService.decrypt as jest.Mock)
      .mockReturnValueOnce('store-key-0000')
      .mockReturnValueOnce('store-key-0000')
      .mockReturnValueOnce('webhook-secret-old')
      .mockReturnValueOnce('webhook-secret-sibling');

    (btcpayService.issueUserApiKey as jest.Mock).mockResolvedValue({
      apiKey: 'store-key-9999',
      permissions: []
    });

    (encryptionService.encrypt as jest.Mock)
      .mockReturnValueOnce({ ciphertext: 'cipher-new', dekWrapped: 'dek-new' })
      .mockReturnValueOnce({ ciphertext: 'webhook-cipher-new', dekWrapped: 'webhook-dek-new' })
      .mockReturnValueOnce({ ciphertext: 'cipher-new-2', dekWrapped: 'dek-new-2' })
      .mockReturnValueOnce({ ciphertext: 'webhook-cipher-new-2', dekWrapped: 'webhook-dek-new-2' });

    const result = await service.rotateStoreApiKey(
      'tenant-entity-id',
      'store-entity-id',
      'actor-3',
      'merchant@example.com'
    );

    expect(btcpayService.issueUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.test',
      'merchant@example.com',
      expect.arrayContaining([
        'btcpay.store.cancreateinvoice:btcpay-store-id',
        'btcpay.store.canviewstoresettings:btcpay-store-id'
      ]),
      { label: 'PayPay internal btcpay-store-id' }
    );
    expect(btcpayService.probeStoreInvoices).toHaveBeenCalledWith(
      'https://btcpay.test',
      'store-key-9999',
      'btcpay-store-id'
    );
    const updateCalls = new Map(
      (storesRepository.update as jest.Mock).mock.calls.map(([id, payload]: [string, Record<string, unknown>]) => [
        id,
        payload
      ])
    );
    expect(updateCalls.get('store-entity-id')).toEqual(
      expect.objectContaining({
        apiKeyCiphertext: expect.any(String),
        apiKeyDekWrapped: expect.any(String),
        webhookId: 'webhook-id',
        webhookSecretCiphertext: expect.any(String),
        webhookSecretDekWrapped: expect.any(String),
        storeKeyLastFour: '9999'
      })
    );
    expect(updateCalls.get('store-entity-id-2')).toEqual(
      expect.objectContaining({
        apiKeyCiphertext: expect.any(String),
        apiKeyDekWrapped: expect.any(String),
        webhookId: 'webhook-id',
        webhookSecretCiphertext: expect.any(String),
        webhookSecretDekWrapped: expect.any(String),
        storeKeyLastFour: '9999'
      })
    );

    expect(encryptionService.encrypt).toHaveBeenCalledWith('store-key-9999');
    expect(encryptionService.encrypt).toHaveBeenCalledWith('webhook-secret-old', expect.any(String));
    expect(encryptionService.encrypt).toHaveBeenCalledWith('webhook-secret-sibling', expect.any(String));
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.key.rotated', resource: 'store-entity-id' })
    );
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'store-key-0000');
    expect(result).toEqual({ lastFour: '9999' });
  });

  it('deletes stores by issuing a temporary modify-settings credential and revoking managed keys', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      dataSource,
      auditRepoInTx
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    const store = {
      id: 'store-entity-id',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id',
      apiKeyCiphertext: 'cipher-old',
      apiKeyDekWrapped: 'dek-old',
      webhookId: 'webhook-id-123',
      apiKeyManagedByTenant: false
    };

    storesRepository.findOne.mockResolvedValue(store);
    storesRepository.find.mockResolvedValue([store]);

    (encryptionService.decrypt as jest.Mock).mockReturnValueOnce('store-key-1111');
    (btcpayService.issueUserApiKey as jest.Mock)
      .mockResolvedValueOnce({
        apiKey: 'temp-key-2222',
        permissions: [
          'btcpay.store.canmodifystoresettings:btcpay-store-id',
          'btcpay.store.webhooks.canmodifywebhooks:btcpay-store-id'
        ]
      })
      .mockResolvedValueOnce({ apiKey: 'store-key-1111', permissions: [] });

    await service.deleteStore(
      'tenant-entity-id',
      'store-entity-id',
      'actor-4',
      '127.0.0.1',
      'merchant@example.com'
    );

    expect(btcpayService.deleteWebhook).toHaveBeenCalledWith(
      'https://btcpay.test',
      'store-key-1111',
      'btcpay-store-id',
      'webhook-id-123'
    );
    expect(btcpayService.deleteStore).toHaveBeenCalledWith(
      'https://btcpay.test',
      'temp-key-2222',
      'btcpay-store-id'
    );
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'temp-key-2222');
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'store-key-1111');

    const deleteWebhookOrder = btcpayService.deleteWebhook.mock.invocationCallOrder[0];
    const deleteStoreOrder = btcpayService.deleteStore.mock.invocationCallOrder[0];
    const revokeCalls = btcpayService.revokeUserApiKey.mock.invocationCallOrder;
    expect(deleteWebhookOrder).toBeLessThan(revokeCalls[0]);
    expect(deleteStoreOrder).toBeLessThan(revokeCalls[0]);

    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.deleted', resource: 'store-entity-id' })
    );
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('revokes managed keys even when sibling stores exist', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      dataSource,
      auditRepoInTx
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    const store = {
      id: 'store-entity-id',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id',
      apiKeyCiphertext: 'cipher-old',
      apiKeyDekWrapped: 'dek-old',
      webhookId: 'webhook-id-123',
      apiKeyManagedByTenant: false
    };
    const sibling = {
      id: 'store-entity-id-2',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id-2',
      apiKeyCiphertext: 'cipher-old-2',
      apiKeyDekWrapped: 'dek-old-2',
      webhookId: 'webhook-id-456',
      apiKeyManagedByTenant: false
    };

    storesRepository.findOne.mockResolvedValue(store);
    storesRepository.find.mockResolvedValue([store, sibling]);

    (encryptionService.decrypt as jest.Mock).mockReturnValueOnce('store-key-1111');
    (btcpayService.issueUserApiKey as jest.Mock)
      .mockResolvedValueOnce({
        apiKey: 'temp-key-3333',
        permissions: [
          'btcpay.store.canmodifystoresettings:btcpay-store-id',
          'btcpay.store.webhooks.canmodifywebhooks:btcpay-store-id'
        ]
      })
      .mockResolvedValueOnce({ apiKey: 'store-key-1111', permissions: [] });

    await service.deleteStore(
      'tenant-entity-id',
      'store-entity-id',
      'actor-4',
      '127.0.0.1',
      'merchant@example.com'
    );

    expect(btcpayService.deleteWebhook).toHaveBeenCalledWith(
      'https://btcpay.test',
      'store-key-1111',
      'btcpay-store-id',
      'webhook-id-123'
    );
    expect(btcpayService.deleteStore).toHaveBeenCalledWith(
      'https://btcpay.test',
      'temp-key-3333',
      'btcpay-store-id'
    );
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'temp-key-3333');
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'store-key-1111');

    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.deleted', resource: 'store-entity-id' })
    );
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});
