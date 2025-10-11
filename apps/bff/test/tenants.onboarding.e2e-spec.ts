import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BtcpayService } from '../src/btcpay/btcpay.service';

describe('Tenants onboarding (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;

  const btcpayMock = {
    resolveBaseUrl: jest.fn((host?: string) => host ?? 'https://btcpay.example'),
    createUser: jest.fn().mockResolvedValue({ id: 'user-1', email: 'merchant@example.com' }),
    issueUserApiKey: jest.fn().mockResolvedValue({ apiKey: 'temp-key', permissions: [] }),
    revokeUserApiKey: jest.fn().mockResolvedValue(undefined),
    createStoreWithUserToken: jest.fn().mockResolvedValue({ id: 'greenfield-store-id' }),
    registerWebhook: jest.fn().mockResolvedValue({ id: 'webhook-id', secret: 'webhook-secret' }),
    buildStorePermissions: jest.fn().mockImplementation((storeId: string) => [
      `btcpay.store.cancreateinvoice:${storeId}`,
      `btcpay.store.canviewinvoices:${storeId}`,
      `btcpay.store.canmodifyinvoices:${storeId}`,
      `btcpay.store.canviewstoresettings:${storeId}`,
      `btcpay.store.webhooks.canmodifywebhooks:${storeId}`
    ]),
    buildBootstrapPermissions: jest.fn().mockReturnValue(['btcpay.store.canmodifystoresettings'])
  } as unknown as jest.Mocked<BtcpayService>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayService)
      .useValue(btcpayMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'merchant@example.com' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  async function fetchCsrf(): Promise<{ token: string }> {
    const response = await agent.get('/api/auth/csrf-token').expect(200);
    expect(response.body).toEqual({ csrfToken: expect.any(String) });
    return { token: response.body.csrfToken };
  }

  it('provisions a tenant and store through the Greenfield API mocks', async () => {
    const { token } = await fetchCsrf();

    btcpayMock.issueUserApiKey
      .mockResolvedValueOnce({ apiKey: 'bootstrap-key', permissions: ['btcpay.store.canmodifystoresettings'] })
      .mockResolvedValueOnce({ apiKey: 'store-key-1234', permissions: [] });

    const response = await agent
      .post('/api/tenants')
      .set('X-CSRF-Token', token)
      .send({
        email: 'merchant@example.com',
        name: 'Merchant',
        storeName: 'Demo Store',
        btcpayHost: 'https://btcpay.example',
        storeWebsite: 'https://merchant.example'
      })
      .expect(201);

    expect(response.body).toEqual({
      tenantId: expect.any(String),
      storeId: expect.any(String),
      btcpayStoreId: 'greenfield-store-id'
    });

    expect(btcpayMock.createUser).toHaveBeenCalledWith('https://btcpay.example', {
      email: 'merchant@example.com',
      name: 'Merchant',
      sendInvitationEmail: true
    });
    expect(btcpayMock.issueUserApiKey).toHaveBeenNthCalledWith(
      1,
      'https://btcpay.example',
      'merchant@example.com',
      ['btcpay.store.canmodifystoresettings'],
      { label: 'PayPay store bootstrap' }
    );
    expect(btcpayMock.createStoreWithUserToken).toHaveBeenCalledWith(
      'https://btcpay.example',
      'bootstrap-key',
      expect.objectContaining({ name: 'Demo Store', website: 'https://merchant.example' })
    );
    expect(btcpayMock.issueUserApiKey).toHaveBeenNthCalledWith(
      2,
      'https://btcpay.example',
      'merchant@example.com',
      expect.arrayContaining([
        'btcpay.store.cancreateinvoice:greenfield-store-id',
        'btcpay.store.canviewstoresettings:greenfield-store-id'
      ]),
      { label: 'PayPay internal greenfield-store-id' }
    );
    expect(btcpayMock.registerWebhook).toHaveBeenCalledWith(
      'https://btcpay.example',
      'store-key-1234',
      'greenfield-store-id'
    );
    expect(btcpayMock.revokeUserApiKey).toHaveBeenCalledWith('https://btcpay.example', 'bootstrap-key');
  });
});
