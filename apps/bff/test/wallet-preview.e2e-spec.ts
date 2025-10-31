import { HttpException, INestApplication, ValidationPipe } from '@nestjs/common';
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
    addresses: Array.from({ length: 5 }, (_, index) => `tb1qpreview${index}`)
  };

  beforeAll(async () => {
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

  it('forwards descriptor preview requests to BTCPay', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-123';
    const descriptor = "wpkh([abcd1234/84'/1'/0']tpubExampleKey/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-preview-descriptor')
      .send({ cryptoCode: 'BTC', derivationScheme: descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
    expect(btcpayProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId,
        method: 'POST',
        path: `/api/v1/stores/${storeId}/payment-methods/OnChain/BTC/preview`,
        requestId: 'req-preview-descriptor',
        data: {
          derivationScheme: descriptor,
          accountKeyPath: "m/84'/1'/0'",
          count: 10
        }
      })
    );
  });

  it('builds descriptors from extended public keys', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-extended';
    const extendedKey = 'tpubD6NzVbkrYhZ4YExampleExtendedKey123456789ABCDEFGHJKLMN';

    await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ cryptoCode: 'BTC', extendedPublicKey: extendedKey })
      .expect(200);

    expect(btcpayProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId,
        method: 'POST',
        path: `/api/v1/stores/${storeId}/payment-methods/OnChain/BTC/preview`,
        data: {
          derivationScheme: `wpkh([00000000/84'/1'/0']${extendedKey}/0/*)`,
          accountKeyPath: "m/84'/1'/0'",
          count: 10
        }
      })
    );
  });

  it('validates that either descriptor or extended key is provided', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-invalid';

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ cryptoCode: 'BTC' })
      .expect(422);

    expect(response.body).toMatchObject({
      message: expect.stringMatching(/descriptor/i)
    });
  });

  it('rejects malformed account key paths', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-bad-path';

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({
        cryptoCode: 'BTC',
        derivationScheme: "wpkh([deadbeef/84'/1'/0']tpubKey/0/*)",
        accountKeyPath: "m/44'/1'/0'"
      })
      .expect(422);

    expect(response.body).toMatchObject({
      message: expect.stringMatching(/account key path/i)
    });
  });

  it('propagates upstream errors from BTCPay', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-upstream';
    btcpayProxy.mockImplementationOnce(() => {
      throw new HttpException('Upstream error', 502);
    });

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ cryptoCode: 'BTC', derivationScheme: "wpkh([abcd1234/84'/1'/0']tpubKey/0/*)" })
      .expect(502);

    expect(response.body).toMatchObject({ message: 'Upstream error' });
  });
});
