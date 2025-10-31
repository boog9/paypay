import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { BtcpayService } from '../src/btcpay/btcpay.service';

function readCsrfToken(response: request.Response): string {
  const token = response.headers['x-csrf-token'];
  if (typeof token !== 'string') {
    throw new Error('Expected x-csrf-token header to be present.');
  }
  return token;
}

describe('Wallet preview controller (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  const btcpayProxy = jest.fn();

  const previewResponse = {
    addresses: Array.from({ length: 10 }, (_, index) => `tb1qpreview${index.toString().padStart(2, '0')}`)
  };

  beforeAll(async () => {
    process.env.NBITCOIN_NETWORK = 'testnet';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BtcpayService)
      .useValue({
        proxy: btcpayProxy
      })
      .overrideProvider(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
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
    jest.clearAllMocks();
    btcpayProxy.mockResolvedValue(previewResponse);
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('forwards preview requests for the stable wallets route', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-123';
    const descriptor = "wpkh([abcd1234/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/btc/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-stable-1')
      .send({ descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
    expect(btcpayProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId,
        method: 'GET',
        path: `/api/v1/stores/${storeId}/payment-methods/BTC-CHAIN/wallet/preview`,
        params: expect.objectContaining({
          derivationScheme: "wpkh([ABCD1234/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)",
          accountKeyPath: "m/84'/1'/0'",
          count: '10'
        }),
        requestId: 'req-stable-1'
      })
    );
  });

  it('keeps the legacy onchain preview route available', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-abc';
    const descriptor = "wpkh([deadbeef/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/payment-methods/onchain/btc/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-legacy-1')
      .send({ descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
    expect(btcpayProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId,
        method: 'GET',
        path: `/api/v1/stores/${storeId}/payment-methods/BTC-CHAIN/wallet/preview`,
        params: expect.objectContaining({
          derivationScheme: "wpkh([DEADBEEF/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)",
          accountKeyPath: "m/84'/1'/0'",
          count: '10'
        }),
        requestId: 'req-legacy-1'
      })
    );
  });
});
