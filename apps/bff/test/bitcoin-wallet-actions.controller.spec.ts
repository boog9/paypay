import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitcoinWalletActionsController } from '../src/wallets/bitcoin-wallet-actions.controller';
import { BtcpayWalletService } from '../src/btcpay/btcpay.wallets.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../src/security/csrf.guard';
import { OnchainWalletsService } from '../src/wallets/onchain-wallets.service';

describe('BitcoinWalletActionsController', () => {
  let app: INestApplication;
  let server: any;
  let repository: jest.Mocked<Repository<ManagedStoreEntity>>;
  let wallets: jest.Mocked<BtcpayWalletService>;
  let onchainWallets: jest.Mocked<OnchainWalletsService>;

  const store: ManagedStoreEntity = {
    id: 'store-id',
    btcpayStoreId: 'BTCPAY123',
    userId: 'user-id'
  } as ManagedStoreEntity;

  class AllowGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 'user-id' };
      return true;
    }
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BitcoinWalletActionsController],
      providers: [
        { provide: getRepositoryToken(ManagedStoreEntity), useValue: { findOne: jest.fn() } },
        { provide: OnchainWalletsService, useValue: { getPresence: jest.fn() } },
        {
          provide: BtcpayWalletService,
          useValue: {
            pruneWalletTransactions: jest.fn(),
            clearWalletTransactions: jest.fn(),
            replaceWallet: jest.fn(),
            removeWallet: jest.fn()
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(CsrfGuard)
      .useClass(AllowGuard)
      .compile();

    repository = moduleRef.get(getRepositoryToken(ManagedStoreEntity));
    wallets = moduleRef.get(BtcpayWalletService);
    onchainWallets = moduleRef.get(OnchainWalletsService);
    repository.findOne.mockResolvedValue(store);

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('lists actions when an on-chain wallet is enabled', async () => {
    onchainWallets.getPresence.mockResolvedValue({ enabled: true, derivationScheme: 'xpub' });

    const response = await request(server)
      .get(`/stores/${store.id}/wallets/btc/actions`)
      .expect(200);

    expect(response.body).toEqual({ actions: ['prune-history', 'clear-history', 'replace', 'remove'] });
    expect(onchainWallets.getPresence).toHaveBeenCalledWith(store);
  });

  it('returns an empty actions list when the wallet is disabled', async () => {
    onchainWallets.getPresence.mockResolvedValue({ enabled: false, derivationScheme: null });

    await request(server)
      .get(`/stores/${store.id}/wallets/btc/actions`)
      .expect(200)
      .expect({ actions: [] });
  });

  it('returns an empty actions list when no on-chain wallet is configured', async () => {
    onchainWallets.getPresence.mockRejectedValue(new NotFoundException());

    await request(server)
      .get(`/stores/${store.id}/wallets/btc/actions`)
      .expect(200)
      .expect({ actions: [] });
  });

  it('returns 404 when the store is not found', async () => {
    repository.findOne.mockResolvedValue(null);

    await request(server).get(`/stores/missing-store/wallets/btc/actions`).expect(404);
  });

  it('prunes history', async () => {
    onchainWallets.getPresence.mockResolvedValue({ enabled: true, derivationScheme: 'xpub' });
    wallets.pruneWalletTransactions.mockResolvedValue(undefined);

    await request(server)
      .post(`/stores/${store.id}/wallets/btc/actions/prune-history`)
      .expect(200)
      .expect({ status: 'ok' });

    expect(wallets.pruneWalletTransactions).toHaveBeenCalledWith(store.btcpayStoreId, 'btc', { store });
  });

  it('clears history', async () => {
    wallets.clearWalletTransactions.mockResolvedValue(undefined);

    await request(server)
      .post(`/stores/${store.id}/wallets/btc/actions/clear-history`)
      .expect(200)
      .expect({ status: 'ok' });

    expect(wallets.clearWalletTransactions).toHaveBeenCalledWith(store.btcpayStoreId, 'btc', { store });
  });

  it('replaces wallet', async () => {
    wallets.replaceWallet.mockResolvedValue(undefined);

    await request(server)
      .post(`/stores/${store.id}/wallets/btc/actions/replace`)
      .send({ confirmation: 'ok' })
      .expect(200)
      .expect({ status: 'ok' });

    expect(wallets.replaceWallet).toHaveBeenCalledWith(store.btcpayStoreId, 'btc', { store });
  });

  it('removes wallet', async () => {
    wallets.removeWallet.mockResolvedValue(undefined);

    await request(server)
      .post(`/stores/${store.id}/wallets/btc/actions/remove`)
      .send({ confirmation: 'ok' })
      .expect(200)
      .expect({ status: 'ok' });

    expect(wallets.removeWallet).toHaveBeenCalledWith(store.btcpayStoreId, 'btc', { store });
  });
});
