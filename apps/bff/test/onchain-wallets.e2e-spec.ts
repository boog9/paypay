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
    updateOnchainPaymentMethod: jest.fn()
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
    const presenceCallOptions = paymentMethodsMock.getOnchain.mock.calls[0]?.[2];
    expect(presenceCallOptions).toBeDefined();
    expect(presenceCallOptions).not.toHaveProperty('includeConfig');
  });

  it('returns presence when resolved via BTCPay store identifier', async () => {
    const response = await agent
      .get(`/api/stores/${store.btcpayStoreId}/wallets/btc/presence`)
      .expect(200);

    expect(response.body).toEqual({ enabled: false, config: { derivationScheme: null } });
  });

  it('validates testnet derivation schemes', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({
        derivationScheme: 'xpub6DQr6ATUNo26pU5ViMmd5eLYCoqUhZMN52JhppqmjdBng2mMPmGhBX4F1p7nyTLMEScjUC2hRuME3Pw9WvctsVkb3tUSVs9HmLxxdKqKwHx'
      })
      .expect(422);
  });

  it('requires derivationScheme when configuring the wallet', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({ accountKeyPath: "m/84'/1'/0'" })
      .expect(400);
  });

  it('enables wallet with extended key and null fingerprint', async () => {
    const csrfToken = await fetchCsrf();

    paymentMethodsMock.updateOnchainPaymentMethod.mockResolvedValueOnce();
    const derivationScheme = 'tpubD6NzVbkrYhZ4YexampleExtendedKey';

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({
        derivationScheme,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: null
      })
      .expect(204);

    const [payload, options] = paymentMethodsMock.updateOnchainPaymentMethod.mock.calls[0];
    expect(payload).toMatchObject({
      storeId: store.btcpayStoreId,
      derivationScheme,
      allowAccountKeyPath: false,
      enabled: true
    });
    expect(payload).not.toHaveProperty('accountKeyPath');
    expect('masterFingerprint' in payload).toBe(false);
    expect(options).toMatchObject({ store });

    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: true,
      config: {
        derivationScheme,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: null,
        label: null
      }
    });

    const presence = await agent
      .get(`/api/stores/${store.id}/wallets/btc/presence`)
      .expect(200);

    expect(presence.body).toEqual({ enabled: true, config: { derivationScheme } });

    const metadata = await agent
      .get(`/api/stores/${store.id}/wallets/bitcoin`)
      .expect(200);

    expect(metadata.body).toMatchObject({
      enabled: true,
      derivationScheme,
      accountKeyPath: "m/84'/1'/0'",
      masterFingerprint: null
    });
  });

  it('extracts fingerprint from descriptor when absent in payload', async () => {
    const csrfToken = await fetchCsrf();

    paymentMethodsMock.updateOnchainPaymentMethod.mockResolvedValueOnce();

    const descriptor = "wpkh([d34db33f/84'/1'/0']tpubD6NzVbkrYhZ4Yexample/0/*)";

    await agent
      .put(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .send({
        derivationScheme: descriptor,
        accountKeyPath: "m/84'/1'/0'"
      })
      .expect(204);

    const descriptorCall = paymentMethodsMock.updateOnchainPaymentMethod.mock.calls[0]?.[0];
    expect(descriptorCall).toMatchObject({
      storeId: store.btcpayStoreId,
      derivationScheme: descriptor,
      allowAccountKeyPath: false,
      enabled: true
    });
    expect(descriptorCall).not.toHaveProperty('accountKeyPath');
    expect(descriptorCall).not.toHaveProperty('masterFingerprint');

    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: true,
      config: {
        derivationScheme: descriptor,
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: 'D34DB33F',
        label: null
      }
    });

    const metadata = await agent
      .get(`/api/stores/${store.id}/wallets/bitcoin`)
      .expect(200);

    expect(metadata.body.masterFingerprint).toBe('D34DB33F');
  });

  it('disables wallet via delete endpoint', async () => {
    const csrfToken = await fetchCsrf();

    paymentMethodsMock.getOnchain.mockResolvedValueOnce({
      enabled: true,
      config: {
        derivationScheme: "wpkh([f00dbabe/84'/1'/0']tpubExample/0/*)",
        accountKeyPath: "m/84'/1'/0'",
        masterFingerprint: 'F00DBABE',
        label: 'Primary'
      }
    });
    paymentMethodsMock.updateOnchainPaymentMethod.mockResolvedValueOnce();

    await agent
      .delete(`/api/stores/${store.id}/wallets/bitcoin`)
      .set('x-csrf-token', csrfToken)
      .expect(204);

    expect(paymentMethodsMock.getOnchain).toHaveBeenCalledWith(
      store.btcpayStoreId,
      'BTC',
      expect.objectContaining({ store })
    );
    const disableCallOptions = paymentMethodsMock.getOnchain.mock.calls.find((call) => call[0] === store.btcpayStoreId)?.[2];
    expect(disableCallOptions).toBeDefined();
    expect(disableCallOptions).not.toHaveProperty('includeConfig');
    expect(paymentMethodsMock.updateOnchainPaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: store.btcpayStoreId,
        derivationScheme: "wpkh([f00dbabe/84'/1'/0']tpubExample/0/*)",
        allowAccountKeyPath: false,
        enabled: false
      }),
      expect.objectContaining({ store })
    );

    const presence = await agent
      .get(`/api/stores/${store.id}/wallets/btc/presence`)
      .expect(200);

    expect(presence.body).toEqual({ enabled: false, config: { derivationScheme: null } });
  });
});
