import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { UserEntity } from '../src/auth/entities/user.entity';
import { BtcpayPaymentMethodsService } from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayWalletService } from '../src/btcpay/btcpay.wallets.service';
import { CsrfGuard } from '../src/security/csrf.guard';

function readCsrfToken(response: request.Response): string {
  const token = response.headers['x-csrf-token'];
  if (typeof token !== 'string') {
    throw new Error('Expected x-csrf-token header to be present.');
  }
  return token;
}

describe('On-chain wallet controller (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  let usersRepository: Repository<UserEntity>;
  let storesRepository: Repository<ManagedStoreEntity>;
  let store: ManagedStoreEntity;
  let authenticatedUser: { id: string; email: string } | null = null;

  const paymentMethodsMock = {
    getOnchain: jest.fn(),
    saveOnchain: jest.fn()
  } as unknown as jest.Mocked<BtcpayPaymentMethodsService>;

  const walletServiceMock = {
    getBitcoinWalletPresence: jest.fn()
  } as unknown as jest.Mocked<BtcpayWalletService>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.NBITCOIN_NETWORK = 'testnet';
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
    process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? 'test';
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'test';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB ?? 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayPaymentMethodsService)
      .useValue(paymentMethodsMock)
      .overrideProvider(BtcpayWalletService)
      .useValue(walletServiceMock)
      .overrideProvider(CsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    app.use((req: any, _res: any, next: () => void) => {
      req.user = authenticatedUser ?? { id: 'user-1', email: 'merchant@example.com' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer();
    agent = request.agent(server);

    usersRepository = moduleRef.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));
    storesRepository = moduleRef.get<Repository<ManagedStoreEntity>>(getRepositoryToken(ManagedStoreEntity));

    const user = usersRepository.create({
      email: 'merchant@example.com',
      passwordHash: 'hash',
      btcpayUserId: 'btcpay-user-id',
      btcpayApiKeyHash: null,
      btcpayApiKeyLabel: null,
      btcpayApiKeyPermissions: null
    });
    const persistedUser = await usersRepository.save(user);
    authenticatedUser = { id: persistedUser.id, email: persistedUser.email };

    store = storesRepository.create({
      userId: persistedUser.id,
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
    });
    await storesRepository.save(store);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(storesRepository, 'findOne').mockResolvedValue(store);
    paymentMethodsMock.getOnchain.mockResolvedValue({
      enabled: false,
      config: {
        derivationScheme: null,
        accountKey: null,
        accountKeyPath: null,
        masterFingerprint: null,
        label: null
      },
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN'
    });
    walletServiceMock.getBitcoinWalletPresence.mockResolvedValue({ hasWallet: false });
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('returns presence based on BTCPay response', async () => {
    walletServiceMock.getBitcoinWalletPresence.mockResolvedValueOnce({ hasWallet: true });

    const response = await agent
      .get(`/api/stores/${store.id}/wallets/btc/presence`)
      .expect(200);

    expect(response.body).toEqual({ hasWallet: true });
    expect(walletServiceMock.getBitcoinWalletPresence).toHaveBeenCalledWith(
      store.btcpayStoreId,
      expect.objectContaining({ store: expect.any(Object), host: store.btcpayHost })
    );
  });

  it('does not throttle repeated wallet presence checks', async () => {
    walletServiceMock.getBitcoinWalletPresence.mockResolvedValue({ hasWallet: true });

    const results = await Promise.all(
      Array.from({ length: 15 }).map(() =>
        agent.get(`/api/stores/${store.id}/wallets/btc/presence`)
      )
    );

    for (const response of results) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ hasWallet: true });
    }

    expect(walletServiceMock.getBitcoinWalletPresence).toHaveBeenCalledTimes(15);
  });

  it('validates testnet extended keys', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({
        tpub: 'xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx',
        rootFingerprint: 'A1B2C3D4',
        accountKeyPath: "84'/1'/0'"
      })
      .expect(422);
  });

  it('requires tpub when configuring the wallet', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({ accountKeyPath: "84'/1'/0'", rootFingerprint: 'A1B2C3D4' })
      .expect(400);
  });

  it('enables wallet with tpub configuration', async () => {
    const csrfToken = await fetchCsrf();

    paymentMethodsMock.saveOnchain.mockResolvedValueOnce({});

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({
        tpub: 'tpubExample',
        rootFingerprint: 'A1B2C3D4',
        accountKeyPath: "84'/1'/0'"
      })
      .expect(204);

    expect(paymentMethodsMock.saveOnchain).toHaveBeenCalledWith(
      store.btcpayStoreId,
      { tpub: 'tpubExample', rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
      { store, enabled: true }
    );

    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: true,
      config: {
        derivationScheme: 'tpubExample',
        accountKeyPath: "84'/1'/0'",
        masterFingerprint: 'A1B2C3D4',
        accountKey: 'tpubExample',
        label: null
      },
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN'
    });

    const metadata = await agent
      .get(`/api/stores/${store.id}/wallets/bitcoin`)
      .expect(200);

    expect(metadata.body).toMatchObject({
      enabled: true,
      derivationScheme: 'tpubExample',
      accountKeyPath: "84'/1'/0'",
      masterFingerprint: 'A1B2C3D4'
    });
  });

  it('disables wallet via delete endpoint', async () => {
    const csrfToken = await fetchCsrf();

    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: true,
      config: {
        derivationScheme: 'tpubExample',
        accountKey: 'tpubExample',
        accountKeyPath: "84'/1'/0'",
        masterFingerprint: 'A1B2C3D4',
        label: null
      },
      storeId: store.btcpayStoreId,
      paymentMethodId: 'BTC-CHAIN'
    });
    paymentMethodsMock.saveOnchain.mockResolvedValueOnce({});

    await agent
      .delete(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .expect(204);

    expect(paymentMethodsMock.saveOnchain).toHaveBeenCalledWith(
      store.btcpayStoreId,
      { tpub: 'tpubExample', rootFingerprint: 'A1B2C3D4', accountKeyPath: "84'/1'/0'" },
      { store, enabled: false }
    );

    const presence = await agent
      .get(`/api/stores/${store.id}/wallets/btc/presence`)
      .expect(200);

    expect(presence.body).toEqual({ hasWallet: false });
  });
});
