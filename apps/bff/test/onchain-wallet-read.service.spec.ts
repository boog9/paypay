import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OnchainWalletReadService } from '../src/wallets/onchain-wallet-read.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { BtcpayWalletService, ListTransactionsResult } from '../src/btcpay/btcpay.wallets.service';
import { BtcpayKeysService } from '../src/btcpay/btcpay.keys.service';
import { BtcpayServerInfoService } from '../src/btcpay/btcpay.server-info.service';
import { ListWalletTransactionsQueryDto } from '../src/wallets/dto/wallet-transactions.dto';

const store: ManagedStoreEntity = {
  id: 'local-store',
  userId: 'tenant-user',
  btcpayStoreId: 'store-123',
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

describe('OnchainWalletReadService', () => {
  const repository = {
    findOne: jest.fn().mockResolvedValue(store)
  } as unknown as Repository<ManagedStoreEntity>;

  const btcpayWallets = {
    listTransactions: jest.fn(),
    getTransaction: jest.fn(),
    getOverview: jest.fn(),
    listUtxos: jest.fn(),
    getReceiveAddress: jest.fn(),
    getFeeRate: jest.fn()
  } as unknown as BtcpayWalletService;

  const keysService = {
    withStoreSettingsWriteKey: jest.fn()
  } as unknown as BtcpayKeysService;

  const serverInfo = {
    isTestnet: jest.fn().mockResolvedValue(true)
  } as unknown as BtcpayServerInfoService;

  const service = new OnchainWalletReadService(repository, btcpayWallets, keysService, serverInfo);

  beforeEach(() => {
    jest.clearAllMocks();
    (serverInfo.isTestnet as jest.Mock).mockResolvedValue(true);
  });

  it('maps BTCPay transactions to wallet transactions with fallback explorer URL', async () => {
    const btcpayResponse: ListTransactionsResult = {
      items: [
        {
          transactionHash: 'abcd1234',
          timestamp: 1_700_000_000,
          confirmations: 3,
          status: 'confirmed',
          amount: '-0.001',
          fee: '0.0001',
          rateUsd: '42000',
          labels: { invoice: { text: 'Invoice #42' } },
          comment: 'Test transaction'
        },
        {
          transactionHash: 'efgh5678',
          timestamp: '2024-01-01T00:00:00Z',
          confirmations: 0,
          status: 'unconfirmed',
          amount: '0.002',
          labels: ['payout'],
          comment: null,
          link: 'https://custom.example/tx/efgh5678'
        }
      ]
    };

    (btcpayWallets.listTransactions as jest.Mock).mockResolvedValue(btcpayResponse);

    const query: ListWalletTransactionsQueryDto = {
      skip: 0,
      count: 50,
      labels: [],
      order: 'desc'
    } as ListWalletTransactionsQueryDto;

    const result = await service.listTransactions(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      'btc',
      query
    );

    expect(btcpayWallets.listTransactions).toHaveBeenCalledWith(store.btcpayStoreId, 'BTC', query, {
      store,
      host: store.btcpayHost
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    const [first, second] = result.items;

    expect(first).toMatchObject({
      txId: 'efgh5678',
      direction: 'in',
      status: 'unconfirmed',
      blockExplorerUrl: 'https://custom.example/tx/efgh5678'
    });

    expect(second).toMatchObject({
      txId: 'abcd1234',
      direction: 'out',
      amount: '-0.001',
      fee: '0.0001',
      rateUsd: 42000,
      status: 'confirmed'
    });
    expect(second.blockExplorerUrl).toBe('https://mempool.space/testnet/tx/abcd1234');
    expect(second.labels).toContain('Invoice #42');
  });

  it('filters transactions by labels using BTCPay fallback key when necessary', async () => {
    const btcpayResponse: ListTransactionsResult = {
      items: [
        { transactionHash: 'one', amount: '0.1', labels: ['invoice'], timestamp: 1_700_000_000 },
        { transactionHash: 'two', amount: '0.2', labels: ['payout'], timestamp: 1_700_000_100 }
      ]
    };

    (btcpayWallets.listTransactions as jest.Mock)
      .mockRejectedValueOnce(new ForbiddenException('limited'))
      .mockResolvedValueOnce(btcpayResponse);

    (keysService.withStoreSettingsWriteKey as jest.Mock).mockImplementation(
      async (_storeId: string, _email: string, handler: (apiKey: string) => Promise<ListTransactionsResult>) =>
        handler('temporary-key')
    );

    const query: ListWalletTransactionsQueryDto = {
      skip: 0,
      count: 50,
      labels: ['invoice'],
      order: 'asc'
    } as ListWalletTransactionsQueryDto;

    const result = await service.listTransactions(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      'btc',
      query
    );

    expect(keysService.withStoreSettingsWriteKey).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'merchant@example.com',
      expect.any(Function),
      { host: store.btcpayHost }
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0]?.txId).toBe('one');
  });

  it('filters transactions by status when requested', async () => {
    const btcpayResponse: ListTransactionsResult = {
      items: [
        { transactionHash: 'confirmed', amount: '0.1', labels: [], status: 'confirmed', timestamp: 1_700_000_000 },
        { transactionHash: 'pending', amount: '0.2', labels: [], status: 'unconfirmed', timestamp: 1_700_000_500 }
      ]
    };

    (btcpayWallets.listTransactions as jest.Mock).mockResolvedValueOnce(btcpayResponse);

    const query: ListWalletTransactionsQueryDto = {
      skip: 0,
      count: 50,
      labels: [],
      order: 'desc',
      status: 'confirmed'
    } as ListWalletTransactionsQueryDto;

    const result = await service.listTransactions(
      { id: 'tenant-user', email: 'merchant@example.com' },
      store.btcpayStoreId,
      'btc',
      query
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.txId).toBe('confirmed');
    expect(result.total).toBe(1);
  });

  it('throws when user context is missing', async () => {
    await expect(
      service.listTransactions({ id: null, email: null }, store.btcpayStoreId, 'btc', {
        skip: 0,
        count: 50,
        labels: [],
        order: 'desc'
      } as ListWalletTransactionsQueryDto)
    ).rejects.toBeInstanceOf(UnauthorizedException);

    (repository.findOne as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.listTransactions({ id: 'tenant-user', email: 'merchant@example.com' }, 'missing-store', 'btc', {
        skip: 0,
        count: 50,
        labels: [],
        order: 'desc'
      } as ListWalletTransactionsQueryDto)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
