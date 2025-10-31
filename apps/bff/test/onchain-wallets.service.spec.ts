import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { OnchainWalletEntity } from '../src/wallets/onchain-wallet.entity';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';

describe('OnchainWalletsService', () => {
  let service: OnchainWalletsService;
  let repository: jest.Mocked<Repository<OnchainWalletEntity>>;
  let paymentMethods: jest.Mocked<BtcpayPaymentMethodsService>;

  const store: ManagedStoreEntity = {
    id: 'store-id',
    userId: 'user-id',
    btcpayStoreId: 'BTCPAY123',
    btcpayHost: 'https://btcpay.example',
    storeName: 'Demo',
    defaultCurrency: 'USD',
    apiKeyCiphertext: 'cipher',
    apiKeyDekWrapped: 'dek',
    webhookId: null,
    webhookSecretCiphertext: null,
    webhookSecretDekWrapped: null,
    storeKeyLastFour: null,
    lastActiveAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  } as ManagedStoreEntity;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnchainWalletsService,
        {
          provide: getRepositoryToken(OnchainWalletEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn((value: Partial<OnchainWalletEntity>) => ({
              id: 'wallet-id',
              enabled: true,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...value
            }))
          }
        },
        {
          provide: BtcpayPaymentMethodsService,
          useValue: {
            getOnchain: jest.fn()
          }
        }
      ]
    }).compile();

    service = moduleRef.get(OnchainWalletsService);
    repository = moduleRef.get(getRepositoryToken(OnchainWalletEntity));
    paymentMethods = jest.mocked(moduleRef.get(BtcpayPaymentMethodsService));
    paymentMethods.getOnchain.mockResolvedValue({
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: 'BTC-CHAIN',
      enabled: false,
      config: {
        derivationScheme: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      }
    });
  });

  it('returns disabled presence when no record exists', async () => {
    repository.findOne.mockResolvedValue(null);

    const presence = await service.getPresence(store);

    expect(presence).toEqual({ enabled: false, derivationScheme: null });
  });

  it('returns metadata and presence when wallet is enabled', async () => {
    paymentMethods.getOnchain.mockResolvedValue({
      storeId: store.btcpayStoreId,
      currency: 'BTC',
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      config: {
        derivationScheme: 'wpkh([ABCD1234/84\'/1\'/0\']tpub123/0/*)',
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: 'ABCD1234',
        label: 'Primary'
      }
    });
    repository.findOne.mockResolvedValue({
      id: 'wallet',
      storeId: store.id,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      derivationScheme: 'wpkh([ABCD1234/84\'/1\'/0\']tpub123/0/*)',
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: 'ABCD1234',
      label: 'Primary',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } as OnchainWalletEntity);

    const presence = await service.getPresence(store);
    const metadata = await service.getMetadata(store);

    expect(presence).toEqual({
      enabled: true,
      derivationScheme: 'wpkh([ABCD1234/84\'/1\'/0\']tpub123/0/*)'
    });
    expect(metadata).toEqual({
      enabled: true,
      derivationScheme: 'wpkh([ABCD1234/84\'/1\'/0\']tpub123/0/*)',
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: 'ABCD1234',
      label: 'Primary'
    });
  });

  it('creates a new wallet metadata record on upsert without storing descriptors', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    await service.upsertFromBtcpay(store, {
      derivationScheme: "wpkh([abcd1234/84'/1'/0']tpub123/0/*)",
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: 'abcd1234',
      label: 'Primary'
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: store.id,
        paymentMethodId: 'BTC-CHAIN',
        derivationScheme: "wpkh([abcd1234/84'/1'/0']tpub123/0/*)",
        label: 'Primary',
        masterFingerprint: 'ABCD1234'
      })
    );
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('preserves existing metadata when fields are omitted', async () => {
    const existing: OnchainWalletEntity = {
      id: 'wallet',
      storeId: store.id,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      derivationScheme: 'PRESENT',
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: 'F00DBABE',
      label: 'Primary',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } as OnchainWalletEntity;

    repository.findOne.mockResolvedValue(existing);

    await service.upsertFromBtcpay(store, {});

    expect(existing.derivationScheme).toBe('PRESENT');
    expect(existing.accountKeyPath).toBe("m/84'/1'/0'");
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('disables an existing wallet', async () => {
    const existing: OnchainWalletEntity = {
      id: 'wallet',
      storeId: store.id,
      paymentMethodId: 'BTC-CHAIN',
      enabled: true,
      derivationScheme: null,
      accountKeyPath: null,
      masterFingerprint: null,
      label: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } as OnchainWalletEntity;

    repository.findOne.mockResolvedValue(existing);

    await service.disable(store);

    expect(existing.enabled).toBe(false);
    expect(existing.deletedAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(existing);
  });

  it('marks metadata disabled when record is soft deleted', async () => {
    repository.findOne.mockResolvedValue({
      id: 'wallet',
      storeId: store.id,
      paymentMethodId: 'BTC-CHAIN',
      enabled: false,
      derivationScheme: 'PRESENT',
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: 'CAFECAFE',
      label: 'Legacy',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date()
    } as OnchainWalletEntity);

    const metadata = await service.getMetadata(store);

    expect(metadata).toEqual({
      enabled: false,
      derivationScheme: null,
      accountKeyPath: null,
      masterFingerprint: null,
      label: null
    });
  });
});
