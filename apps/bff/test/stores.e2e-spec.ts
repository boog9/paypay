import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { BtcpayService } from '../src/btcpay/btcpay.service';
import { UserEntity } from '../src/auth/entities/user.entity';
import { ManagedStoreEntity } from '../src/stores/managed-store.entity';
import { IdempotencyKeyEntity } from '../src/tenants/entities/idempotency-key.entity';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

function readCsrfToken(response: request.Response): string {
  const token = response.headers['x-csrf-token'];
  if (typeof token !== 'string') {
    throw new Error('Expected x-csrf-token header to be a string');
  }
  return token;
}

describe('Stores onboarding (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: request.SuperAgentTest;
  let usersRepository: Repository<UserEntity>;
  let managedStoresRepository: Repository<ManagedStoreEntity>;
  let idempotencyRepository: Repository<IdempotencyKeyEntity>;

  const btcpayMock = {
    resolveBaseUrl: jest.fn(() => 'https://btcpay.example'),
    issueUserApiKeyWithPermissions: jest.fn(),
    createStoreUsingUserKey: jest.fn(),
    setCoinGeckoAsDefaultRateSource: jest.fn(),
    issueStoreScopedApiKey: jest.fn(),
    listStores: jest.fn(),
    registerWebhook: jest.fn(),
    buildStorePermissions: jest.fn((storeId: string) => [
      `btcpay.store.cancreateinvoice:${storeId}`,
      `btcpay.store.canviewinvoices:${storeId}`,
      `btcpay.store.canmodifyinvoices:${storeId}`,
      `btcpay.store.canviewstoresettings:${storeId}`,
      `btcpay.store.webhooks.canmodifywebhooks:${storeId}`,
    ]),
    revokeUserApiKey: jest.fn(),
    buildBootstrapPermissions: jest.fn(() => ['btcpay.store.canmodifystoresettings']),
  } as unknown as jest.Mocked<BtcpayService>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BtcpayService)
      .useValue(btcpayMock)
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
        email: 'merchant@example.com',
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
    managedStoresRepository = moduleRef.get<Repository<ManagedStoreEntity>>(getRepositoryToken(ManagedStoreEntity));
    idempotencyRepository = moduleRef.get<Repository<IdempotencyKeyEntity>>(getRepositoryToken(IdempotencyKeyEntity));
    const user = usersRepository.create({
      email: 'merchant@example.com',
      passwordHash: 'hash',
      btcpayUserId: 'user-btcpay-id',
      btcpayApiKeyHash: null,
      btcpayApiKeyLabel: null,
      btcpayApiKeyPermissions: null,
    });
    await usersRepository.save(user);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await managedStoresRepository.clear();
    await idempotencyRepository.clear();
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    const token = readCsrfToken(response);
    expect(typeof token).toBe('string');
    return token;
  }

  it('creates a store and lists it', async () => {
    btcpayMock.listStores.mockResolvedValueOnce([]);

    const emptyListResponse = await agent.get('/api/stores').expect(200);
    expect(emptyListResponse.body).toEqual([]);

    const csrfToken = await fetchCsrf();

    btcpayMock.issueUserApiKeyWithPermissions.mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    btcpayMock.createStoreUsingUserKey.mockResolvedValueOnce({
      id: 'store-1',
      name: 'Demo Store',
      defaultCurrency: 'USD',
    });
    btcpayMock.setCoinGeckoAsDefaultRateSource.mockResolvedValueOnce(undefined);
    btcpayMock.issueStoreScopedApiKey.mockResolvedValueOnce({ apiKey: 'internal-key' });

    btcpayMock.registerWebhook.mockResolvedValueOnce({ id: 'webhook-1', secret: 'webhook-secret' });

    const createResponse = await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Demo Store', defaultCurrency: 'USD' })
      .expect(200);

    expect(createResponse.body).toEqual({
      storeId: 'store-1',
      name: 'Demo Store',
      defaultCurrency: 'USD',
    });

    expect(btcpayMock.issueUserApiKeyWithPermissions).toHaveBeenCalledWith(
      'user-btcpay-id',
      ['btcpay.store.canmodifystoresettings'],
      'portal-bootstrap'
    );
    expect(btcpayMock.createStoreUsingUserKey).toHaveBeenCalledWith(
      'bootstrap-key',
      expect.objectContaining({ name: 'Demo Store', defaultCurrency: 'USD' })
    );
    expect(btcpayMock.setCoinGeckoAsDefaultRateSource).toHaveBeenCalledWith(
      'https://btcpay.example',
      'bootstrap-key',
      'store-1'
    );
    expect(btcpayMock.issueStoreScopedApiKey).toHaveBeenCalledWith(
      'user-btcpay-id',
      'store-1',
      'portal-internal-store-1',
      expect.arrayContaining([
        'btcpay.store.cancreateinvoice:store-1',
        'btcpay.store.canviewstoresettings:store-1',
      ])
    );
    expect(btcpayMock.registerWebhook).toHaveBeenCalledWith(
      'https://btcpay.example',
      'internal-key',
      'store-1'
    );

    const stored = await managedStoresRepository.findOneOrFail({ where: { btcpayStoreId: 'store-1' } });
    expect(stored.storeKeyLastFour).toBe('-key');
    expect(stored.apiKeyCiphertext).not.toEqual('internal-key');
    expect(stored.apiKeyCiphertext).toBeTruthy();
    expect(stored.apiKeyDekWrapped).toBeTruthy();
    expect(stored.webhookId).toBe('webhook-1');
    expect(stored.webhookSecretCiphertext).toBeTruthy();
    expect(stored.webhookSecretDekWrapped).toBeTruthy();

    const user = await usersRepository.findOneOrFail({ where: { email: 'merchant@example.com' } });
    expect(user.btcpayApiKeyHash).toBeTruthy();
    expect(user.btcpayApiKeyLabel).toBe('portal-bootstrap');
    expect(user.btcpayApiKeyPermissions).toContain('btcpay.store.canmodifystoresettings');

    expect(btcpayMock.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.example', 'bootstrap-key');

    btcpayMock.listStores.mockResolvedValueOnce([
      { id: 'store-1', name: 'Demo Store', defaultCurrency: 'USD' },
    ]);

    const listResponse = await agent.get('/api/stores').expect(200);
    expect(listResponse.body).toEqual([
      { id: 'store-1', name: 'Demo Store', defaultCurrency: 'USD' },
    ]);
  });

  it('prevents creating duplicate store names for the same user', async () => {
    const user = await usersRepository.findOneOrFail({ where: { email: 'merchant@example.com' } });
    await managedStoresRepository.save(
      managedStoresRepository.create({
        user,
        userId: user.id,
        btcpayStoreId: 'existing-store-id',
        storeName: 'Duplicate Store',
        defaultCurrency: 'USD',
        btcpayHost: 'https://btcpay.example',
        apiKeyCiphertext: 'cipher',
        apiKeyDekWrapped: 'dek',
        lastActiveAt: new Date(),
      }),
    );

    const csrfToken = await fetchCsrf();

    const response = await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Duplicate Store', defaultCurrency: 'USD' })
      .expect(409);

    expect(response.body.message).toContain('already exists');
    expect(btcpayMock.issueUserApiKeyWithPermissions).not.toHaveBeenCalled();
  });

  it('propagates BTCPay failures when store creation fails', async () => {
    const csrfToken = await fetchCsrf();

    btcpayMock.issueUserApiKeyWithPermissions.mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    btcpayMock.createStoreUsingUserKey.mockRejectedValueOnce(new Error('BTCPay offline'));

    await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Failing Store', defaultCurrency: 'USD' })
      .expect(500);

    expect(btcpayMock.issueUserApiKeyWithPermissions).toHaveBeenCalled();
    expect(btcpayMock.createStoreUsingUserKey).toHaveBeenCalled();
    expect(btcpayMock.setCoinGeckoAsDefaultRateSource).not.toHaveBeenCalled();
  });

  it('returns 500 and does not issue a key when rate source configuration fails', async () => {
    const csrfToken = await fetchCsrf();

    btcpayMock.issueUserApiKeyWithPermissions.mockResolvedValueOnce({ apiKey: 'bootstrap-key' });
    btcpayMock.createStoreUsingUserKey.mockResolvedValueOnce({ id: 'store-err', name: 'X' });
    btcpayMock.setCoinGeckoAsDefaultRateSource.mockRejectedValueOnce(new Error('rates failed'));

    await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'X', defaultCurrency: 'USD' })
      .expect(500);

    expect(btcpayMock.issueStoreScopedApiKey).not.toHaveBeenCalled();
  });

  it('reuses results when the same Idempotency-Key is provided', async () => {
    const csrfToken = await fetchCsrf();

    btcpayMock.issueUserApiKeyWithPermissions.mockResolvedValue({ apiKey: 'bootstrap-key' });
    btcpayMock.createStoreUsingUserKey.mockResolvedValue({ id: 'store-idem', name: 'S' });
    btcpayMock.setCoinGeckoAsDefaultRateSource.mockResolvedValue(undefined);
    btcpayMock.issueStoreScopedApiKey.mockResolvedValue({ apiKey: 'scoped' });

    await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'k1')
      .send({ name: 'S', defaultCurrency: 'USD' })
      .expect(201);

    await agent
      .post('/api/stores')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'k1')
      .send({ name: 'S', defaultCurrency: 'USD' })
      .expect(201);

    expect(btcpayMock.createStoreUsingUserKey).toHaveBeenCalledTimes(1);
    expect(btcpayMock.issueUserApiKeyWithPermissions).toHaveBeenCalledTimes(1);
    expect(btcpayMock.issueStoreScopedApiKey).toHaveBeenCalledTimes(1);
    expect(btcpayMock.setCoinGeckoAsDefaultRateSource).toHaveBeenCalledTimes(1);
  });
});
