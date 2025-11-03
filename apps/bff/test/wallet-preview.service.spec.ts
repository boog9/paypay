import { UnprocessableEntityException } from '@nestjs/common';
import { WalletPreviewService } from '../src/wallets/wallet-preview.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';

describe('WalletPreviewService', () => {
  const store: ManagedStoreEntity = {
    id: 'store-entity-id',
    userId: 'user-id',
    btcpayStoreId: 'btcpay-store-id',
    btcpayHost: 'https://btcpay.example',
    storeName: 'Demo store',
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

  const storesRepository = {
    findOne: jest.fn()
  } as unknown as { findOne: jest.Mock };

  const paymentMethods = {
    previewOnchainAddresses: jest.fn()
  } as unknown as { previewOnchainAddresses: jest.Mock };

  let service: WalletPreviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findOne.mockResolvedValue(store);
    paymentMethods.previewOnchainAddresses.mockResolvedValue({ addresses: [] });
    service = new WalletPreviewService(storesRepository as any, paymentMethods as any);
  });

  it('passes extended public keys with the default account path', async () => {
    const extendedKey = 'tpubD6NzVbkrYhZ4YExampleExtendedKey123456789ABCDEFGHJKLMN';

    await service.previewOnchainProposedConfig('btcpay-store-id', { derivationScheme: extendedKey });

    expect(storesRepository.findOne).toHaveBeenCalledWith({
      where: [{ btcpayStoreId: 'btcpay-store-id' }]
    });
    expect(paymentMethods.previewOnchainAddresses).toHaveBeenCalledWith(
      'store-entity-id',
      {
        derivationScheme: extendedKey,
        accountKeyPath: "m/84'/1'/0'"
      },
      { store }
    );
  });

  it('uses provided descriptor without forwarding account key path', async () => {
    const descriptor = "wpkh([deadbeef/84'/1'/0']tpubKey/0/*)";

    await service.previewOnchainProposedConfig('store-entity-id', {
      derivationScheme: descriptor,
      accountKeyPath: "m/84'/1'/5'",
      masterFingerprint: 'deadbeef'
    });

    expect(paymentMethods.previewOnchainAddresses).toHaveBeenCalledWith(
      'store-entity-id',
      { derivationScheme: descriptor },
      { store }
    );
  });

  it('rejects unmanaged stores', async () => {
    storesRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.previewOnchainProposedConfig('unknown-store', { derivationScheme: 'wpkh([abcd/84\'/1\'/0\']xpub/0/*)' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('omits account key path when descriptor is provided without explicit path', async () => {
    await service.previewOnchainProposedConfig('store-entity-id', {
      derivationScheme: 'wpkh([f00dbabe]tpubExample/0/*)'
    });

    expect(paymentMethods.previewOnchainAddresses).toHaveBeenCalledWith(
      'store-entity-id',
      {
        derivationScheme: 'wpkh([f00dbabe]tpubExample/0/*)'
      },
      { store }
    );
  });
});
