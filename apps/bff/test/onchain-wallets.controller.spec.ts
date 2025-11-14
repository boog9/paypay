import { OnchainWalletsController } from '../src/wallets/onchain-wallets.controller';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayWalletService } from '../src/btcpay/btcpay.wallets.service';

describe('OnchainWalletsController', () => {
  it('resolves stores by btcpayStoreId when identifier is not a UUID', async () => {
    const store: ManagedStoreEntity = {
      id: 'generated-id',
      userId: 'user-1',
      btcpayStoreId: 'JDm5GuV',
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

    const repository = {
      findOne: jest.fn().mockResolvedValue(store)
    };

    const walletsService = {
      getPresence: jest.fn().mockResolvedValue({ enabled: false, derivationScheme: null })
    } as unknown as OnchainWalletsService;

    const paymentMethods = {} as BtcpayPaymentMethodsService;

    const btcpayWallets = {
      getBitcoinWalletPresence: jest.fn().mockResolvedValue({ hasWallet: false })
    } as unknown as BtcpayWalletService;

    const controller = new OnchainWalletsController(
      repository as any,
      walletsService,
      paymentMethods,
      btcpayWallets
    );

    await controller.getPresence({ id: 'user-1' } as any, 'JDm5GuV');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: [{ btcpayStoreId: 'JDm5GuV', userId: 'user-1' }]
    });
    expect((btcpayWallets.getBitcoinWalletPresence as jest.Mock).mock.calls[0][0]).toBe('JDm5GuV');
  });
});
