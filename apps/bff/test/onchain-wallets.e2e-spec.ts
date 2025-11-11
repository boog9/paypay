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

  const paymentMethodsMock = {
    getOnchain: jest.fn(),
    saveOnchain: jest.fn()
  } as unknown as jest.Mocked<BtcpayPaymentMethodsService>;

  beforeAll(async () => {
    process.env.NBITCOIN_NETWORK = 'testnet';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayPaymentMethodsService)
      .useValue(paymentMethodsMock)
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'user-1',
        email: 'merchant@example.com'
      };
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
    paymentMethodsMock.getOnchain.mockResolvedValue({
      enabled: false,
      config: { derivationScheme: null }
    });
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('returns presence based on BTCPay response', async () => {
    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: false,
      config: { derivationScheme: null }
    });

    const response = await agent
      .get(`/api/stores/${store.id}/wallets/btc/presence`)
      .expect(200);

    expect(response.body).toEqual({ enabled: false, config: { derivationScheme: null } });
    expect(paymentMethodsMock.getOnchain).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'BTC',
      expect.objectContaining({ store: expect.any(Object) })
    );
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
        accountKey: 'tpubExample'
      }
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
        masterFingerprint: 'A1B2C3D4'
      }
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

    expect(presence.body).toEqual({ enabled: false, config: { derivationScheme: null } });
  });
});
