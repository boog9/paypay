import {
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe
} from '@nestjs/common';
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
import {
  BtcpayPaymentMethodsService,
  OnchainPaymentMethodConfig,
  OnchainPreviewResponse
} from '../src/btcpay/btcpay.payment-methods.service';
import { BtcpayKeysService } from '../src/btcpay/btcpay.keys.service';

function readCsrfToken(response: request.Response): string {
  const token = response.headers['x-csrf-token'];
  if (typeof token !== 'string') {
    throw new Error('Expected x-csrf-token header to be present.');
  }
  return token;
}

describe('On-chain wallet preview (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: request.SuperAgentTest;
  let usersRepository: Repository<UserEntity>;
  let storesRepository: Repository<ManagedStoreEntity>;
  let userId: string;

  const previewResponse: OnchainPreviewResponse = {
    storeId: 'store-123',
    currency: 'BTC',
    paymentMethodId: 'BTC-CHAIN',
    addresses: Array.from({ length: 5 }, (_, index) => ({
      address: `bcrt1qpreview${index}`,
      keyPath: `0/${index}`,
      index
    }))
  };

  const SAMPLE_TPUB =
    "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";
  const SAMPLE_VPUB = SAMPLE_TPUB.replace(/^tpub/, 'vpub');
  const SAMPLE_DESCRIPTOR = `wpkh([f00dbabe/84'/1'/0']${SAMPLE_TPUB}/0/*)`;

  const paymentMethodsMock = {
    previewOnchainPaymentMethod: jest.fn().mockResolvedValue(previewResponse),
    getOnchain: jest.fn()
  } as unknown as jest.Mocked<BtcpayPaymentMethodsService>;

  const keysServiceMock = {
    withStoreSettingsReadKey: jest.fn(),
    withStoreSettingsWriteKey: jest.fn()
  } as unknown as jest.Mocked<BtcpayKeysService>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayPaymentMethodsService)
      .useValue(paymentMethodsMock)
      .overrideProvider(BtcpayKeysService)
      .useValue(keysServiceMock)
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
    userId = persistedUser.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await storesRepository.clear();
    const store = storesRepository.create({
      userId,
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
    });
    await storesRepository.save(store);

    keysServiceMock.withStoreSettingsReadKey.mockImplementation(async (_storeId, _email, handler) => {
      return handler('scoped-key');
    });
    keysServiceMock.withStoreSettingsWriteKey.mockImplementation(async (_storeId, _email, handler) => {
      return handler('elevated-key');
    });
    paymentMethodsMock.previewOnchainPaymentMethod.mockResolvedValue(previewResponse);
    paymentMethodsMock.getOnchain.mockReset();
  });

  function makePresenceResponse(
    overrides: Partial<OnchainPaymentMethodConfig> = {}
  ): OnchainPaymentMethodConfig {
    return {
      storeId: overrides.storeId ?? 'store-123',
      currency: overrides.currency ?? 'BTC',
      paymentMethodId: overrides.paymentMethodId ?? 'BTC-CHAIN',
      enabled: overrides.enabled ?? true,
      config: {
        derivationScheme:
          overrides.config?.derivationScheme ?? "wpkh([f00dbabe/84'/1'/0']tpubExample/0/*)",
        accountKeyPath: overrides.config?.accountKeyPath ?? "m/84'/1'/0'",
        masterFingerprint: overrides.config?.masterFingerprint ?? 'f00dbabe',
        label: overrides.config?.label ?? 'Demo wallet'
      }
    } satisfies OnchainPaymentMethodConfig;
  }

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('returns canonical on-chain wallet presence payload with derivation scheme', async () => {
    paymentMethodsMock.getOnchain.mockResolvedValueOnce(makePresenceResponse());

    const response = await agent
      .get('/api/stores/store-123/wallets/btc/presence')
      .expect(200);

    expect(keysServiceMock.withStoreSettingsWriteKey).toHaveBeenCalledWith(
      'store-123',
      'merchant@example.com',
      expect.any(Function),
      { host: 'https://btcpay.example' }
    );
    expect(paymentMethodsMock.getOnchain).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      expect.objectContaining({
        includeConfig: true,
        apiKeyOverride: 'elevated-key',
        host: 'https://btcpay.example'
      })
    );
    expect(response.body).toEqual({
      enabled: true,
      config: {
        derivationScheme: "wpkh([f00dbabe/84'/1'/0']tpubExample/0/*)"
      }
    });
  });

  it('returns disabled presence payload when BTCPay reports the wallet as disabled', async () => {
    paymentMethodsMock.getOnchain.mockResolvedValueOnce(
      makePresenceResponse({
        enabled: false,
        config: { derivationScheme: "wpkh([f00dbabe/84'/1'/0']tpubExample/0/*)" }
      })
    );

    const response = await agent
      .get('/api/stores/store-123/wallets/btc/presence')
      .expect(200);

    expect(response.body).toEqual({
      enabled: false,
      config: { derivationScheme: null }
    });
  });

  it('returns disabled presence payload when BTCPay reports the wallet missing', async () => {
    paymentMethodsMock.getOnchain.mockRejectedValueOnce(new NotFoundException('not found'));

    const response = await agent
      .get('/api/stores/store-123/wallets/btc/presence')
      .expect(200);

    expect(keysServiceMock.withStoreSettingsWriteKey).toHaveBeenCalledWith(
      'store-123',
      'merchant@example.com',
      expect.any(Function),
      { host: 'https://btcpay.example' }
    );
    expect(response.body).toEqual({
      enabled: false,
      config: { derivationScheme: null }
    });
  });

  it('returns preview addresses for proposed derivation scheme', async () => {
    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "m/84'/1'/0'"
      })
      .expect(200);

    expect(keysServiceMock.withStoreSettingsReadKey).toHaveBeenCalledWith(
      'store-123',
      'merchant@example.com',
      expect.any(Function),
      { host: 'https://btcpay.example' }
    );
    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "m/84'/1'/0'"
      },
      expect.objectContaining({
        store: expect.objectContaining({ btcpayStoreId: 'store-123' }),
        apiKeyOverride: 'scoped-key'
      })
    );
    expect(response.body).toEqual({
      storeId: 'store-123',
      currency: 'BTC',
      paymentMethodId: 'BTC-CHAIN',
      addresses: previewResponse.addresses
    });
  });

  it('returns preview addresses for testnet key without account path', async () => {
    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme: SAMPLE_TPUB })
      .expect(200);

    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: null
      },
      expect.any(Object)
    );
    expect(response.body.addresses).toEqual(previewResponse.addresses);
  });

  it('returns preview addresses for vpub key with account path', async () => {
    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({
        derivationScheme: SAMPLE_VPUB,
        accountKeyPath: "m/84'/1'/0'"
      })
      .expect(200);

    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_VPUB,
        accountKeyPath: "m/84'/1'/0'"
      },
      expect.any(Object)
    );
    expect(response.body.addresses).toEqual(previewResponse.addresses);
  });

  it('returns preview addresses for descriptor inputs', async () => {
    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme: SAMPLE_DESCRIPTOR })
      .expect(200);

    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_DESCRIPTOR,
        accountKeyPath: null
      },
      expect.any(Object)
    );
    expect(response.body.addresses).toEqual(previewResponse.addresses);
  });

  it('propagates BTCPay validation errors as 422 responses', async () => {
    paymentMethodsMock.previewOnchainPaymentMethod.mockRejectedValueOnce(
      new UnprocessableEntityException('Descriptor checksum mismatch')
    );

    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({
        derivationScheme: `wpkh([abcd1234/84'/1'/0']${SAMPLE_TPUB}/0/*)`,
        accountKeyPath: "m/84'/1'/0'"
      })
      .expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      message: 'Descriptor checksum mismatch',
      error: 'Unprocessable Entity'
    });
  });

  it('trims derivation scheme before forwarding to BTCPay', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme: `  ${SAMPLE_DESCRIPTOR}  ` })
      .expect(200);

    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_DESCRIPTOR,
        accountKeyPath: null
      },
      expect.any(Object)
    );
  });

  it('accepts arbitrary account key paths when provided', async () => {
    const csrfToken = await fetchCsrf();

    await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: "  m/custom/path  "
      })
      .expect(200);

    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledWith(
      'store-123',
      'BTC',
      {
        derivationScheme: SAMPLE_TPUB,
        accountKeyPath: 'm/custom/path'
      },
      expect.any(Object)
    );
  });

  it('escalates to write-scope preview if BTCPay rejects with 403', async () => {
    paymentMethodsMock.previewOnchainPaymentMethod
      .mockRejectedValueOnce(new ForbiddenException('BTCPay returned limited permissions'))
      .mockResolvedValueOnce(previewResponse);
    keysServiceMock.withStoreSettingsWriteKey.mockImplementationOnce(
      async (_storeId, _email, handler) => handler('elevated-key')
    );

    const csrfToken = await fetchCsrf();

    await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme: SAMPLE_DESCRIPTOR })
      .expect(200);

    expect(keysServiceMock.withStoreSettingsReadKey).toHaveBeenCalledTimes(1);
    expect(keysServiceMock.withStoreSettingsWriteKey).toHaveBeenCalledTimes(1);
    expect(paymentMethodsMock.previewOnchainPaymentMethod).toHaveBeenCalledTimes(2);
  });

  it('rejects empty derivation schemes', async () => {
    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores/store-123/wallets/btc/preview')
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme: '   ' })
      .expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      message: [
        "Enter xpub/ypub/zpub/tpub/upub/vpub or a descriptor (e.g., wpkh([FPR/84'/1'/0']tpub.../0/*)). Account key path is optional."
      ],
      error: 'Unprocessable Entity'
    });
  });

  it('redirects legacy wallet presence path to the canonical btc route', async () => {
    const res = await agent
      .get('/api/stores/store-123/wallets/bitcoin/presence')
      .expect(307);
    expect(res.headers.location).toBe('../btc/presence');
  });
});
