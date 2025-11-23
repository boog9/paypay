import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitcoinWalletActionsController } from '../src/wallets/bitcoin-wallet-actions.controller';
import { BtcpayWalletService } from '../src/btcpay/btcpay.wallets.service';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CsrfGuard } from '../src/security/csrf.guard';

describe('BitcoinWalletActionsController', () => {
  let app: INestApplication;
  let server: any;
  let repository: jest.Mocked<Repository<ManagedStoreEntity>>;
  let wallets: jest.Mocked<BtcpayWalletService>;

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
    repository.findOne.mockResolvedValue(store);

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('prunes history', async () => {
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
