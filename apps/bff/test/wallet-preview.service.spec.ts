import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
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
    previewWithDescriptor: jest.fn(),
    previewWithTpub: jest.fn()
  } as unknown as {
    previewWithDescriptor: jest.Mock;
    previewWithTpub: jest.Mock;
  };

  let service: WalletPreviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    storesRepository.findOne.mockResolvedValue(store);
    paymentMethods.previewWithDescriptor.mockResolvedValue({ addresses: [] });
    paymentMethods.previewWithTpub.mockResolvedValue({ addresses: [] });
    service = new WalletPreviewService(storesRepository as any, paymentMethods as any);
  });

  it('delegates descriptor preview when derivationScheme provided', async () => {
    await service.previewOnchainProposedConfig('btcpay-store-id', {
      derivationScheme: "wpkh([FPR/84'/1'/0']tpub.../0/*)",
      accountKeyPath: "m/84'/1'/0'"
    });

    expect(paymentMethods.previewWithDescriptor).toHaveBeenCalledWith(
      'store-entity-id',
      { derivationScheme: "wpkh([FPR/84'/1'/0']tpub.../0/*)", accountKeyPath: "m/84'/1'/0'" },
      { store }
    );
  });

  it('rejects descriptor preview without account key path', async () => {
    await expect(
      service.previewOnchainProposedConfig('btcpay-store-id', {
        derivationScheme: 'wpkh(tpub.../0/*)'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates tpub preview when extended key data supplied', async () => {
    await service.previewOnchainProposedConfig('btcpay-store-id', {
      tpub: 'tpubExample',
      rootFingerprint: 'A1B2C3D4',
      accountKeyPath: "84'/1'/0'"
    });

    expect(paymentMethods.previewWithTpub).toHaveBeenCalledWith(
      'store-entity-id',
      { tpub: 'tpubExample', rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
      { store }
    );
  });

  it('enforces root fingerprint when tpub provided', async () => {
    await expect(
      service.previewOnchainProposedConfig('btcpay-store-id', {
        tpub: 'tpubExample',
        accountKeyPath: "84'/1'/0'"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces account key path format for tpub preview', async () => {
    await expect(
      service.previewOnchainProposedConfig('btcpay-store-id', {
        tpub: 'tpubExample',
        rootFingerprint: 'A1B2C3D4',
        accountKeyPath: "m/84'/1'/0'"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payloads without descriptor or tpub', async () => {
    await expect(
      service.previewOnchainProposedConfig('btcpay-store-id', {
        accountKeyPath: "m/84'/1'/0'"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unmanaged stores', async () => {
    storesRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.previewOnchainProposedConfig('unknown-store', {
        derivationScheme: "wpkh([FPR/84'/1'/0']tpub.../0/*)",
        accountKeyPath: "m/84'/1'/0'"
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
