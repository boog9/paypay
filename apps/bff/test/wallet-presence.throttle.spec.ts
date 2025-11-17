import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OnchainWalletsController } from '../src/wallets/onchain-wallets.controller';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayWalletService } from '../src/btcpay/btcpay.wallets.service';
import type { RequestUser } from '../src/auth/decorators/req-user.decorator';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../src/security/csrf.guard';

const store = {
  id: 'store-123',
  btcpayStoreId: 'btcpay-store-123',
  btcpayHost: 'https://btcpay.test'
} as ManagedStoreEntity;

const user: RequestUser = {
  id: 'user-1',
  email: 'merchant@example.com'
};

class AllowGuard {
  canActivate() {
    return true;
  }
}

describe('Wallet presence throttling', () => {
  let controller: OnchainWalletsController;
  const walletsMock = {
    getBitcoinWalletPresence: jest.fn()
  } as unknown as jest.Mocked<BtcpayWalletService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OnchainWalletsController],
      providers: [
        {
          provide: getRepositoryToken(ManagedStoreEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue(store)
          }
        },
        { provide: OnchainWalletsService, useValue: {} },
        { provide: BtcpayPaymentMethodsService, useValue: {} },
        { provide: BtcpayWalletService, useValue: walletsMock }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(CsrfGuard)
      .useClass(AllowGuard)
      .compile();

    controller = moduleRef.get(OnchainWalletsController);
    walletsMock.getBitcoinWalletPresence.mockReset();
    walletsMock.getBitcoinWalletPresence.mockResolvedValue({ hasWallet: true });
  });

  it('handles repeated presence requests without throttling responses', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }).map(() => controller.getPresence(user, store.id))
    );

    expect(results).toEqual(Array(12).fill({ hasWallet: true }));
    expect(walletsMock.getBitcoinWalletPresence).toHaveBeenCalledTimes(12);
  });
});
