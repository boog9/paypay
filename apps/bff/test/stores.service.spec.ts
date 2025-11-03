import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoresService } from '../src/stores/stores.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { UserEntity } from '../src/auth/entities/user.entity';
import { IdempotencyKeyEntity } from '../src/tenants/entities/idempotency-key.entity';
import { BtcpayService } from '../src/btcpay/btcpay.service';
import { EnvelopeEncryptionService } from '../src/security/envelope-encryption.service';
import { UsersService } from '../src/auth/users.service';

const managedStoresRepositoryMock = () => ({
  findOne: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
});

const usersRepositoryMock = () => ({
  findOne: jest.fn(),
});

const idempotencyRepositoryMock = () => ({
  findOne: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn(),
});

describe('StoresService', () => {
  let service: StoresService;
  let storesRepository: jest.Mocked<Repository<ManagedStoreEntity>>;
  let usersRepository: jest.Mocked<Repository<UserEntity>>;
  let idempotencyRepository: jest.Mocked<Repository<IdempotencyKeyEntity>>;
  let btcpayService: jest.Mocked<BtcpayService>;
  let encryptionService: jest.Mocked<EnvelopeEncryptionService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: getRepositoryToken(ManagedStoreEntity), useFactory: managedStoresRepositoryMock },
        { provide: getRepositoryToken(UserEntity), useFactory: usersRepositoryMock },
        { provide: getRepositoryToken(IdempotencyKeyEntity), useFactory: idempotencyRepositoryMock },
        {
          provide: BtcpayService,
          useValue: {
            resolveBaseUrl: jest.fn(() => 'https://btcpay.example'),
            issueUserApiKeyWithPermissions: jest.fn(),
            createStoreUsingUserKey: jest.fn(),
            setCoinGeckoAsDefaultRateSource: jest.fn(),
            issueStoreScopedApiKey: jest.fn(),
            registerWebhook: jest.fn(),
            deleteWebhook: jest.fn(),
            revokeUserApiKey: jest.fn(),
            buildStorePermissions: jest.fn((storeId: string) => [
              `btcpay.store.cancreateinvoice:${storeId}`,
              `btcpay.store.canmodifystoresettings:${storeId}`,
              `btcpay.store.canviewstoresettings:${storeId}`,
            ]),
            buildBootstrapPermissions: jest.fn(() => ['btcpay.store.canmodifystoresettings']),
          },
        },
        {
          provide: EnvelopeEncryptionService,
          useValue: {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getBootstrapMeta: jest.fn(async () => ({})),
            hashBootstrapApiKey: jest.fn(() => 'hash'),
            saveBootstrapMeta: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(StoresService);
    storesRepository = moduleRef.get(getRepositoryToken(ManagedStoreEntity));
    usersRepository = moduleRef.get(getRepositoryToken(UserEntity));
    idempotencyRepository = moduleRef.get(getRepositoryToken(IdempotencyKeyEntity));
    btcpayService = moduleRef.get(BtcpayService);
    encryptionService = moduleRef.get(EnvelopeEncryptionService);
    usersService = moduleRef.get(UsersService);
  });

  it('creates a store, issues scoped key, registers webhook, and omits secrets', async () => {
    usersRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'merchant@example.com',
      btcpayUserId: 'btcpay-user-1',
    } as UserEntity);

    storesRepository.findOne.mockResolvedValueOnce(null);

    (btcpayService.issueUserApiKeyWithPermissions as jest.Mock).mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    (btcpayService.createStoreUsingUserKey as jest.Mock).mockResolvedValueOnce({
      id: 'store-1',
      name: 'Demo Store',
    });
    (btcpayService.setCoinGeckoAsDefaultRateSource as jest.Mock).mockResolvedValueOnce(undefined);
    (btcpayService.issueStoreScopedApiKey as jest.Mock).mockResolvedValueOnce({ apiKey: 'internal-key' });
    (btcpayService.registerWebhook as jest.Mock).mockResolvedValueOnce({ id: 'webhook-1', secret: 'hook-secret' });

    (encryptionService.encrypt as jest.Mock)
      .mockReturnValueOnce({ ciphertext: 'ciphertext', dekWrapped: 'dek' })
      .mockImplementationOnce((_value: string, dekWrapped?: string) => {
        expect(dekWrapped).toBe('dek');
        return { ciphertext: 'hook-cipher', dekWrapped: 'dek' };
      });

    const result = await service.provisionStoreForUser(
      'user-1',
      'merchant@example.com',
      { name: 'Demo Store', defaultCurrency: 'usd' },
      null,
    );

    expect(result).toEqual({ storeId: 'store-1', name: 'Demo Store', defaultCurrency: 'USD' });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('secret');

    expect(btcpayService.issueUserApiKeyWithPermissions).toHaveBeenCalledWith(
      'btcpay-user-1',
      ['btcpay.store.canmodifystoresettings'],
      'portal-bootstrap',
    );
    expect(btcpayService.createStoreUsingUserKey).toHaveBeenCalledWith('bootstrap-key', {
      name: 'Demo Store',
      defaultCurrency: 'USD',
    });
    expect(btcpayService.issueStoreScopedApiKey).toHaveBeenCalledWith(
      'btcpay-user-1',
      'store-1',
      { labelPrefix: 'portal-internal' },
    );
    expect(btcpayService.registerWebhook).toHaveBeenCalledWith(
      'https://btcpay.example',
      'internal-key',
      'store-1',
    );

    expect(storesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyCiphertext: 'ciphertext',
        apiKeyDekWrapped: 'dek',
        webhookId: 'webhook-1',
        webhookSecretCiphertext: 'hook-cipher',
        webhookSecretDekWrapped: 'dek',
      }),
    );
    expect(storesRepository.save).toHaveBeenCalled();
    expect(usersService.saveBootstrapMeta).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(idempotencyRepository.save).not.toHaveBeenCalled();
  });

  it('attempts to delete the webhook if persistence fails after registration', async () => {
    usersRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'merchant@example.com',
      btcpayUserId: 'btcpay-user-1',
    } as UserEntity);

    storesRepository.findOne.mockResolvedValueOnce(null);

    (btcpayService.issueUserApiKeyWithPermissions as jest.Mock).mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    (btcpayService.createStoreUsingUserKey as jest.Mock).mockResolvedValueOnce({
      id: 'store-1',
      name: 'Demo Store',
    });
    (btcpayService.setCoinGeckoAsDefaultRateSource as jest.Mock).mockResolvedValueOnce(undefined);
    (btcpayService.issueStoreScopedApiKey as jest.Mock).mockResolvedValueOnce({ apiKey: 'internal-key' });
    (btcpayService.registerWebhook as jest.Mock).mockResolvedValueOnce({ id: 'webhook-1', secret: 'hook-secret' });

    (encryptionService.encrypt as jest.Mock)
      .mockReturnValueOnce({ ciphertext: 'ciphertext', dekWrapped: 'dek' })
      .mockReturnValueOnce({ ciphertext: 'hook-cipher', dekWrapped: 'hook-dek' });

    storesRepository.save.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.provisionStoreForUser(
        'user-1',
        'merchant@example.com',
        { name: 'Demo Store', defaultCurrency: 'usd' },
        null,
      )
    ).rejects.toThrow('database unavailable');

    expect(btcpayService.deleteWebhook).toHaveBeenCalledWith(
      'https://btcpay.example',
      'internal-key',
      'store-1',
      'webhook-1',
    );
    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.example', 'internal-key');
  });

  it('throws when BTCPay does not return a webhook secret', async () => {
    usersRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'merchant@example.com',
      btcpayUserId: 'btcpay-user-1',
    } as UserEntity);

    storesRepository.findOne.mockResolvedValueOnce(null);

    (btcpayService.issueUserApiKeyWithPermissions as jest.Mock).mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    (btcpayService.createStoreUsingUserKey as jest.Mock).mockResolvedValueOnce({
      id: 'store-1',
      name: 'Demo Store',
    });
    (btcpayService.setCoinGeckoAsDefaultRateSource as jest.Mock).mockResolvedValueOnce(undefined);
    (btcpayService.issueStoreScopedApiKey as jest.Mock).mockResolvedValueOnce({ apiKey: 'internal-key' });
    (btcpayService.registerWebhook as jest.Mock).mockResolvedValueOnce({ id: 'webhook-1' });

    await expect(
      service.provisionStoreForUser(
        'user-1',
        'merchant@example.com',
        { name: 'Demo Store', defaultCurrency: 'usd' },
        null,
      )
    ).rejects.toThrow('BTCPay did not return a webhook secret.');

    expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.example', 'internal-key');
    expect(btcpayService.deleteWebhook).not.toHaveBeenCalled();
  });
});
