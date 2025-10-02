import { DataSource } from 'typeorm';
import { TenantsService } from '../src/tenants/tenants.service';
import { TenantEntity } from '../src/tenants/entities/tenant.entity';
import { StoreEntity } from '../src/tenants/entities/store.entity';
import { AuditLogEntity } from '../src/tenants/entities/audit-log.entity';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { BtcpayService } from '../src/btcpay/btcpay.service';

describe('TenantsService onboarding flows', () => {
  function createService() {
    const tenantsRepository = {
      findOne: jest.fn()
    } as unknown as jest.Mocked<any>;
    const storesRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<any>;
    const auditRepository = {
      save: jest.fn()
    } as unknown as jest.Mocked<any>;
    const idempotencyRepository = {} as unknown as jest.Mocked<any>;

    const encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn()
    } as unknown as jest.Mocked<EnvelopeEncryptionService>;

    const btcpayService = {
      resolveBaseUrl: jest.fn((host?: string) => host ?? 'https://btcpay.test'),
      createUser: jest.fn().mockResolvedValue({ id: 'user-1', email: 'merchant@example.com' }),
      createUserApiKeyUnscoped: jest.fn().mockResolvedValue({ apiKey: 'temp-key', permissions: ['btcpay.store.canmodifystoresettings'] }),
      createStoreWithUserToken: jest.fn().mockResolvedValue({ id: 'btcpay-store-id' }),
      deleteApiKey: jest.fn().mockResolvedValue(undefined),
      createUserApiKey: jest.fn().mockResolvedValue({ apiKey: 'store-key', permissions: [] }),
      registerWebhook: jest.fn().mockResolvedValue({ id: 'webhook-id', secret: 'webhook-secret' }),
      deleteWebhook: jest.fn().mockResolvedValue(undefined),
      deleteStore: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<BtcpayService>;

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

    type TestEntityManager = {
      getRepository: jest.Mock;
    };

    const manager: TestEntityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === TenantEntity) return tenantRepoInTx;
        if (entity === StoreEntity) return storeRepoInTx;
        if (entity === AuditLogEntity) return auditRepoInTx;
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
      dataSource
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
      auditRepoInTx
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates tenants using temporary user keys and revokes them', async () => {
    const {
      service,
      encryptionService,
      btcpayService,
      dataSource,
      tenantRepoInTx,
      storeRepoInTx,
      auditRepoInTx
    } = createService();

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
    expect(btcpayService.createUserApiKeyUnscoped).toHaveBeenCalledWith(
      'https://btcpay.custom',
      'merchant@example.com',
      ['btcpay.store.canmodifystoresettings'],
      'Temp store setup'
    );
    expect(btcpayService.createStoreWithUserToken).toHaveBeenCalledWith('https://btcpay.custom', 'temp-key', {
      name: 'Demo Store'
    });
    expect(btcpayService.deleteApiKey).toHaveBeenCalledWith('https://btcpay.custom', 'temp-key');
    expect(btcpayService.createUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.custom',
      'merchant@example.com',
      'btcpay-store-id'
    );
    expect(btcpayService.registerWebhook).toHaveBeenCalledWith('https://btcpay.custom', 'store-key', 'btcpay-store-id');

    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(1, 'store-key');
    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(2, 'webhook-secret', 'api-dek');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(tenantRepoInTx.create).toHaveBeenCalled();
    expect(storeRepoInTx.create).toHaveBeenCalled();
    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.created', actorId: 'actor-1' })
    );

    expect(result).toEqual({
      tenantId: 'tenant-entity-id',
      storeId: 'store-entity-id',
      btcpayStoreId: 'btcpay-store-id'
    });
  });

  it('creates additional stores using the temporary user key flow', async () => {
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
    storesRepository.findOne.mockResolvedValue({ btcpayHost: 'https://btcpay.test' });

    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'api-cipher', dekWrapped: 'api-dek' });
    (encryptionService.encrypt as jest.Mock).mockReturnValueOnce({ ciphertext: 'webhook-cipher', dekWrapped: 'webhook-dek' });

    const result = await service.createAdditionalStore(
      'tenant-entity-id',
      {
        storeName: 'Second Store'
      },
      'actor-2',
      '127.0.0.1',
      'merchant@example.com'
    );

    expect(btcpayService.createUser).not.toHaveBeenCalled();
    expect(btcpayService.createUserApiKeyUnscoped).toHaveBeenCalledWith(
      'https://btcpay.test',
      'merchant@example.com',
      ['btcpay.store.canmodifystoresettings'],
      'Temp store setup'
    );
    expect(btcpayService.createStoreWithUserToken).toHaveBeenCalledWith('https://btcpay.test', 'temp-key', {
      name: 'Second Store'
    });
    expect(btcpayService.deleteApiKey).toHaveBeenCalledWith('https://btcpay.test', 'temp-key');
    expect(btcpayService.createUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.test',
      'merchant@example.com',
      'btcpay-store-id'
    );
    expect(btcpayService.registerWebhook).toHaveBeenCalledWith('https://btcpay.test', 'store-key', 'btcpay-store-id');

    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(1, 'store-key');
    expect(encryptionService.encrypt).toHaveBeenNthCalledWith(2, 'webhook-secret', 'api-dek');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(storeRepoInTx.create).toHaveBeenCalled();
    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.created', actorId: 'actor-2' })
    );

    expect(result).toEqual({ storeId: 'store-entity-id', btcpayStoreId: 'btcpay-store-id' });
  });

  it('rotates store API keys while revoking the previous key', async () => {
    const {
      service,
      tenantsRepository,
      storesRepository,
      encryptionService,
      btcpayService,
      auditRepository
    } = createService();

    tenantsRepository.findOne.mockResolvedValue({ id: 'tenant-entity-id', email: 'merchant@example.com' });
    storesRepository.findOne.mockResolvedValue({
      id: 'store-entity-id',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id',
      apiKeyCiphertext: 'cipher-old',
      apiKeyDekWrapped: 'dek-old',
      webhookSecretCiphertext: 'webhook-cipher',
      webhookSecretDekWrapped: 'webhook-dek'
    });

    (encryptionService.decrypt as jest.Mock)
      .mockReturnValueOnce('store-key-0000')
      .mockReturnValueOnce('webhook-secret-old');

    (btcpayService.createUserApiKey as jest.Mock).mockResolvedValue({
      apiKey: 'store-key-9999',
      permissions: []
    });

    (encryptionService.encrypt as jest.Mock)
      .mockReturnValueOnce({ ciphertext: 'cipher-new', dekWrapped: 'dek-new' })
      .mockReturnValueOnce({ ciphertext: 'webhook-cipher-new', dekWrapped: 'webhook-dek-new' });

    const result = await service.rotateStoreApiKey(
      'tenant-entity-id',
      'store-entity-id',
      'actor-3',
      'merchant@example.com'
    );

    expect(btcpayService.createUserApiKey).toHaveBeenCalledWith(
      'https://btcpay.test',
      'merchant@example.com',
      'btcpay-store-id'
    );
    expect(storesRepository.update).toHaveBeenCalledWith(
      'store-entity-id',
      expect.objectContaining({
        apiKeyCiphertext: 'cipher-new',
        apiKeyDekWrapped: 'dek-new',
        webhookSecretCiphertext: 'webhook-cipher-new',
        webhookSecretDekWrapped: 'webhook-dek-new',
        storeKeyLastFour: '9999'
      })
    );
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.apiKeyRotated', resource: 'store-entity-id' })
    );
    expect(btcpayService.deleteApiKey).toHaveBeenCalledWith('https://btcpay.test', 'store-key-0000');
    expect(result).toEqual({ lastFour: '9999' });
  });

  it('deletes stores by using the scoped key before revoking it', async () => {
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
    storesRepository.findOne.mockResolvedValue({
      id: 'store-entity-id',
      tenantId: 'tenant-entity-id',
      btcpayHost: 'https://btcpay.test',
      btcpayStoreId: 'btcpay-store-id',
      apiKeyCiphertext: 'cipher-old',
      apiKeyDekWrapped: 'dek-old',
      webhookId: 'webhook-id-123'
    });

    (encryptionService.decrypt as jest.Mock).mockReturnValueOnce('store-key-1111');

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
      'store-key-1111',
      'btcpay-store-id'
    );
    expect(btcpayService.deleteApiKey).toHaveBeenCalledWith('https://btcpay.test', 'store-key-1111');

    const deleteWebhookOrder = btcpayService.deleteWebhook.mock.invocationCallOrder[0];
    const deleteStoreOrder = btcpayService.deleteStore.mock.invocationCallOrder[0];
    const deleteKeyOrder = btcpayService.deleteApiKey.mock.invocationCallOrder[0];
    expect(deleteWebhookOrder).toBeLessThan(deleteKeyOrder);
    expect(deleteStoreOrder).toBeLessThan(deleteKeyOrder);

    expect(auditRepoInTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.store.deleted', resource: 'store-entity-id' })
    );
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});
