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
      findOne: jest.fn()
    } as unknown as jest.Mocked<any>;
    const auditRepository = {} as unknown as jest.Mocked<any>;
    const idempotencyRepository = {} as unknown as jest.Mocked<any>;

    const encryptionService = {
      encrypt: jest.fn()
    } as unknown as jest.Mocked<EnvelopeEncryptionService>;

    const btcpayService = {
      resolveBaseUrl: jest.fn((host?: string) => host ?? 'https://btcpay.test'),
      createUser: jest.fn().mockResolvedValue({ id: 'user-1', email: 'merchant@example.com' }),
      createUserApiKeyUnscoped: jest.fn().mockResolvedValue({ apiKey: 'temp-key', permissions: ['btcpay.store.canmodifystoresettings'] }),
      createStoreWithUserToken: jest.fn().mockResolvedValue({ id: 'btcpay-store-id' }),
      deleteApiKey: jest.fn().mockResolvedValue(undefined),
      createUserApiKey: jest.fn().mockResolvedValue({ apiKey: 'store-key', permissions: [] }),
      registerWebhook: jest.fn().mockResolvedValue({ id: 'webhook-id', secret: 'webhook-secret' })
    } as unknown as jest.Mocked<BtcpayService>;

    const tenantRepoInTx = {
      create: jest.fn((payload) => ({ id: 'tenant-entity-id', ...payload })),
      save: jest.fn().mockImplementation(async (entity) => entity)
    };
    const storeRepoInTx = {
      create: jest.fn((payload) => ({ id: 'store-entity-id', ...payload })),
      save: jest.fn().mockImplementation(async (entity) => entity)
    };
    const auditRepoInTx = {
      save: jest.fn().mockResolvedValue(undefined)
    };

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === TenantEntity) return tenantRepoInTx;
        if (entity === StoreEntity) return storeRepoInTx;
        if (entity === AuditLogEntity) return auditRepoInTx;
        throw new Error('Unexpected repository request');
      })
    };

    const dataSource = {
      transaction: jest.fn(async (callback: (manager: typeof manager) => Promise<any>) => callback(manager))
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
        btcpayHost: 'https://btcpay.custom',
        includePullPayments: false
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
    expect(btcpayService.createUserApiKey).toHaveBeenCalledWith('https://btcpay.custom', 'merchant@example.com', 'btcpay-store-id', false);
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
        storeName: 'Second Store',
        includePullPayments: true
      },
      'actor-2',
      '127.0.0.1'
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
    expect(btcpayService.createUserApiKey).toHaveBeenCalledWith('https://btcpay.test', 'merchant@example.com', 'btcpay-store-id', true);
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
});
