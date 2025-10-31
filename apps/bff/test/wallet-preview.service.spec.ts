import { UnprocessableEntityException } from '@nestjs/common';
import { WalletPreviewService } from '../src/wallets/wallet-preview.service';

describe('WalletPreviewService', () => {
  const proxy = jest.fn();
  let service: WalletPreviewService;

  beforeEach(() => {
    proxy.mockReset();
    proxy.mockResolvedValue({ addresses: [] });
    service = new WalletPreviewService({ proxy } as any);
  });

  it('builds descriptors from extended public keys', async () => {
    const extendedKey = 'tpubD6NzVbkrYhZ4YExampleExtendedKey123456789ABCDEFGHJKLMN';

    await service.previewOnchainProposedConfig(
      'store-1',
      { cryptoCode: 'BTC', extendedPublicKey: extendedKey },
      { requestId: 'req-1' }
    );

    expect(proxy).toHaveBeenCalledWith({
      storeId: 'store-1',
      method: 'POST',
      path: '/api/v1/stores/store-1/payment-methods/OnChain/BTC/preview',
      data: {
        derivationScheme: `wpkh([00000000/84'/1'/0']${extendedKey}/0/*)`,
        accountKeyPath: "m/84'/1'/0'",
        count: 10
      },
      requestId: 'req-1'
    });
  });

  it('forwards descriptors unchanged', async () => {
    const descriptor = "wpkh([deadbeef/84'/1'/0']tpubKey/0/*)";

    await service.previewOnchainProposedConfig(
      'store-2',
      { cryptoCode: 'BTC', derivationScheme: descriptor, accountKeyPath: "m/84'/1'/5'" },
      { requestId: 'req-2' }
    );

    expect(proxy).toHaveBeenCalledWith({
      storeId: 'store-2',
      method: 'POST',
      path: '/api/v1/stores/store-2/payment-methods/OnChain/BTC/preview',
      data: {
        derivationScheme: descriptor,
        accountKeyPath: "m/84'/1'/5'",
        count: 10
      },
      requestId: 'req-2'
    });
  });

  it('throws an UnprocessableEntityException for invalid account key paths', async () => {
    await expect(
      service.previewOnchainProposedConfig(
        'store-3',
        {
          cryptoCode: 'BTC',
          extendedPublicKey: 'tpubD6NzVbkrYhZ4YExampleExtendedKey123456789ABCDEFGHJKLMN',
          accountKeyPath: "m/45'/1'/0'"
        }
      )
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
