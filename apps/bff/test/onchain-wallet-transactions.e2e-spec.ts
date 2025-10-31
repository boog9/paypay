import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { OnchainWalletReadService } from '../src/wallets/onchain-wallet-read.service';

describe('On-chain wallet transactions controller (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  const listTransactions = jest.fn();

  const responsePayload = { total: 1, items: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(OnchainWalletReadService)
      .useValue({
        listTransactions,
        getTransaction: jest.fn(),
        getOverview: jest.fn(),
        listUtxos: jest.fn(),
        getReceiveAddress: jest.fn(),
        getFeeRate: jest.fn()
      })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { id: 'user-1', email: 'merchant@example.com' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: false, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer();
    agent = request.agent(server);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listTransactions.mockReset();
    listTransactions.mockResolvedValue(responsePayload);
  });

  it('returns transactions from the read service', async () => {
    const storeId = 'store-123';

    const response = await agent
      .get(`/api/stores/${storeId}/wallets/onchain/transactions?cryptoCode=BTC&skip=5&take=10`)
      .expect(200);

    expect(response.body).toEqual(responsePayload);
    expect(listTransactions).toHaveBeenCalledWith(
      { id: 'user-1', email: 'merchant@example.com' },
      storeId,
      'BTC',
      expect.objectContaining({ skip: 5, count: 10 })
    );
  });

  it('rejects unsupported crypto codes', async () => {
    const storeId = 'store-456';

    await agent
      .get(`/api/stores/${storeId}/wallets/onchain/transactions?cryptoCode=DOGE&skip=0&take=10`)
      .expect(400);

    expect(listTransactions).not.toHaveBeenCalled();
  });

  it('validates query parameters', async () => {
    const storeId = 'store-789';

    await agent
      .get(`/api/stores/${storeId}/wallets/onchain/transactions?cryptoCode=BTC&take=-5`)
      .expect(422);

    expect(listTransactions).not.toHaveBeenCalled();
  });
});
