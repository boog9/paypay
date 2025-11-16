import { NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  remove: jest.fn(async (value) => value),
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
            resolveBaseUrl: jest.fn((host?: string) => host ?? 'https://btcpay.example'),
            issueUserApiKeyWithPermissions: jest.fn(),
            createStoreUsingUserKey: jest.fn(),
            setCoinGeckoAsDefaultRateSource: jest.fn(),
            issueStoreScopedApiKey: jest.fn(),
            registerWebhook: jest.fn(),
            deleteWebhook: jest.fn(),
            revokeUserApiKey: jest.fn(),
            issueUserApiKey: jest.fn(),
            getStore: jest.fn(),
            updateStore: jest.fn(),
            deleteStore: jest.fn(),
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
      undefined,
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

  describe('getStoreSettings', () => {
    const context = { userId: 'user-1', email: 'merchant@example.com', bootstrapApiKey: null };

    it('throws UnauthorizedException when context lacks user information', async () => {
      await expect(
        service.getStoreSettings({ userId: null, email: null, bootstrapApiKey: null }, 'store-1')
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws NotFoundException when the store is not owned by the user', async () => {
      storesRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.getStoreSettings(context, 'store-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(storesRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', btcpayStoreId: 'store-1' }
      });
    });

    it('returns normalized settings fetched from BTCPay', async () => {
      const entity = {
        userId: 'user-1',
        btcpayStoreId: 'store-1',
        storeName: 'Legacy name',
        defaultCurrency: 'btc',
        btcpayHost: 'https://merchant-host',
        apiKeyCiphertext: 'cipher',
        apiKeyDekWrapped: 'dek'
      } as ManagedStoreEntity;

      storesRepository.findOne.mockResolvedValueOnce(entity);
      encryptionService.decrypt.mockReturnValueOnce('decrypted-key');
      btcpayService.getStore.mockResolvedValueOnce({
        id: 'store-1',
        name: ' Demo Store ',
        website: ' https://demo.example ',
        defaultCurrency: 'usd'
      });

      const result = await service.getStoreSettings(context, 'store-1');

      expect(btcpayService.resolveBaseUrl).toHaveBeenCalledWith('https://merchant-host');
      expect(btcpayService.getStore).toHaveBeenCalledWith('https://merchant-host', 'decrypted-key', 'store-1');
      expect(result).toEqual({
        storeId: 'store-1',
        name: 'Demo Store',
        website: 'https://demo.example',
        defaultCurrency: 'USD'
      });
    });
  });

  describe('updateStoreSettings', () => {
    const context = { userId: 'user-1', email: 'merchant@example.com', bootstrapApiKey: null };

    it('throws UnauthorizedException when context is missing', async () => {
      await expect(
        service.updateStoreSettings({ userId: null, email: null, bootstrapApiKey: null }, 'store-1', {})
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws NotFoundException when the store is absent', async () => {
      storesRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.updateStoreSettings(context, 'store-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the store via BTCPay and persists normalized values locally', async () => {
      const entity = {
        userId: 'user-1',
        btcpayStoreId: 'store-1',
        storeName: 'Old name',
        defaultCurrency: 'btc',
        btcpayHost: 'https://merchant-host',
      } as ManagedStoreEntity;

      storesRepository.findOne.mockResolvedValueOnce(entity);
      usersRepository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'merchant@example.com',
        btcpayUserId: 'btcpay-user-1'
      } as UserEntity);
      btcpayService.issueUserApiKey.mockResolvedValueOnce({ apiKey: 'temp-key' });
      btcpayService.updateStore.mockResolvedValueOnce({
        id: 'store-1',
        name: ' New Store ',
        website: ' https://updated.example ',
        defaultCurrency: 'eur'
      });

      const result = await service.updateStoreSettings(context, 'store-1', {
        name: 'New Store',
        website: 'https://updated.example',
        defaultCurrency: 'eur'
      });

      expect(btcpayService.issueUserApiKey).toHaveBeenCalledWith(
        'https://merchant-host',
        'btcpay-user-1',
        ['btcpay.store.canmodifystoresettings:store-1'],
        { label: 'portal-store-settings' }
      );
      expect(btcpayService.updateStore).toHaveBeenCalledWith('https://merchant-host', 'temp-key', 'store-1', {
        name: 'New Store',
        website: 'https://updated.example',
        defaultCurrency: 'eur'
      });
      expect(storesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ storeName: 'New Store', defaultCurrency: 'EUR' })
      );
      expect(result).toEqual({
        storeId: 'store-1',
        name: 'New Store',
        website: 'https://updated.example',
        defaultCurrency: 'EUR'
      });
      expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://merchant-host', 'temp-key');
    });

    it('revokes the temporary API key even when BTCPay update fails', async () => {
      const entity = {
        userId: 'user-1',
        btcpayStoreId: 'store-1',
        storeName: 'Old name',
        defaultCurrency: 'btc',
        btcpayHost: 'https://merchant-host',
      } as ManagedStoreEntity;

      storesRepository.findOne.mockResolvedValueOnce(entity);
      usersRepository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'merchant@example.com',
        btcpayUserId: 'btcpay-user-1'
      } as UserEntity);
      btcpayService.issueUserApiKey.mockResolvedValueOnce({ apiKey: 'temp-key' });
      btcpayService.updateStore.mockRejectedValueOnce(new Error('update failed'));

      await expect(
        service.updateStoreSettings(context, 'store-1', { name: 'Another' })
      ).rejects.toThrow('update failed');

      expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://merchant-host', 'temp-key');
    });
  });

  describe('deleteStore', () => {
    const context = { userId: 'user-1', email: 'merchant@example.com', bootstrapApiKey: null };

    it('throws UnauthorizedException when context is missing', async () => {
      await expect(
        service.deleteStore({ userId: null, email: null, bootstrapApiKey: null }, 'store-1')
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws NotFoundException when store cannot be found', async () => {
      storesRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.deleteStore(context, 'store-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the store in BTCPay, revokes the key, and removes the record', async () => {
      const entity = {
        userId: 'user-1',
        btcpayStoreId: 'store-1',
        storeName: 'Demo Store',
        defaultCurrency: 'usd',
        btcpayHost: 'https://merchant-host',
      } as ManagedStoreEntity;

      storesRepository.findOne.mockResolvedValueOnce(entity);
      usersRepository.findOne.mockResolvedValueOnce({
        id: 'user-1',
        email: 'merchant@example.com',
        btcpayUserId: 'btcpay-user-1'
      } as UserEntity);
      btcpayService.issueUserApiKey.mockResolvedValueOnce({ apiKey: 'temp-key' });
      btcpayService.deleteStore.mockResolvedValueOnce(undefined);

      await service.deleteStore(context, 'store-1');

      expect(btcpayService.issueUserApiKey).toHaveBeenCalledWith(
        'https://merchant-host',
        'btcpay-user-1',
        ['btcpay.store.canmodifystoresettings:store-1'],
        { label: 'portal-store-settings' }
      );
      expect(btcpayService.deleteStore).toHaveBeenCalledWith('https://merchant-host', 'temp-key', 'store-1');
      expect(storesRepository.remove).toHaveBeenCalledWith(entity);
      expect(btcpayService.revokeUserApiKey).toHaveBeenCalledWith('https://merchant-host', 'temp-key');
    });
  });
});
