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
    btcpayProxy.mockImplementation((options: any) => {
      if (options?.path === '/api/v1/server/info') {
        return { isTestnet: true };
      }
      return previewResponse;
    });
  });

  async function fetchCsrf(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(204);
    return readCsrfToken(response);
  }

  it('proxies preview requests for the onchain wallet route', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-123';
    const descriptor = "wpkh([abcd1234/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-stable-1')
      .send({ derivationScheme: descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(2);
    expect(btcpayProxy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId,
        method: 'GET',
        path: '/api/v1/server/info',
        requestId: 'req-stable-1'
      })
    );
    const postCall = btcpayProxy.mock.calls[1]?.[0];
    expect(postCall).toMatchObject({
      storeId,
      method: 'POST',
      path: `/api/v1/stores/${storeId}/payment-methods/BTC-CHAIN/wallet/preview`,
      requestId: 'req-stable-1'
    });
    expect(postCall.data).toEqual({
      derivationScheme: "wpkh([ABCD1234/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)",
      count: 10
    });
  });

  it('keeps the stable wallets route available', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-legacy';
    const descriptor = "wpkh([deadbeef/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/btc/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-stable-legacy')
      .send({ derivationScheme: descriptor, accountKeyPath: " m/84'/1'/0' " })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(2);
    expect(btcpayProxy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId,
        method: 'GET',
        path: '/api/v1/server/info',
        requestId: 'req-stable-legacy'
      })
    );
    const postCall = btcpayProxy.mock.calls[1]?.[0];
    expect(postCall).toMatchObject({
      storeId,
      method: 'POST',
      path: `/api/v1/stores/${storeId}/payment-methods/BTC-CHAIN/wallet/preview`,
      requestId: 'req-stable-legacy'
    });
    expect(postCall.data).toEqual({
      derivationScheme: "wpkh([DEADBEEF/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)",
      accountKeyPath: "m/84'/1'/0'",
      count: 10
    });
  });

  it('keeps the legacy onchain preview route available', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-abc';
    const descriptor = "wpkh([deadbe01/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)";

    const response = await agent
      .post(`/api/stores/${storeId}/payment-methods/onchain/btc/preview`)
      .set('x-csrf-token', csrfToken)
      .set('x-request-id', 'req-legacy-1')
      .send({ derivationScheme: descriptor })
      .expect(200);

    expect(response.body).toEqual(previewResponse);
    expect(btcpayProxy).toHaveBeenCalledTimes(2);
    expect(btcpayProxy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId,
        method: 'GET',
        path: '/api/v1/server/info',
        requestId: 'req-legacy-1'
      })
    );
    const postCall = btcpayProxy.mock.calls[1]?.[0];
    expect(postCall).toMatchObject({
      storeId,
      method: 'POST',
      path: `/api/v1/stores/${storeId}/payment-methods/BTC-CHAIN/wallet/preview`,
      requestId: 'req-legacy-1'
    });
    expect(postCall.data).toEqual({
      derivationScheme: "wpkh([DEADBE01/84'/1'/0']tpubD6NzVbkrYhZ4Yg2WvB3mMD1j3uF6q/0/*)",
      count: 10
    });
  });

  it('applies default account key path for extended keys when missing', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-fallback';
    const tpub = 'tpubD6NzVbkrYhZ4YFALLBACKKEYEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUV';

    await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ derivationScheme: tpub })
      .expect(200);

    expect(btcpayProxy).toHaveBeenCalledTimes(2);
    const postCall = btcpayProxy.mock.calls[1]?.[0];
    expect(postCall?.data).toEqual({
      derivationScheme: tpub,
      accountKeyPath: "m/84'/1'/0'",
      count: 10
    });
  });

  it('returns 422 when extended key network mismatches instance network', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-mismatch';
    const xpub = 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKpP3wXfg9irjdVjWYvvZP5Di5urN6byjHgNsx3Rp3XJ2nV4jArtypoidE1xB2S7R5CV2wzzQ7on3d';

    btcpayProxy.mockImplementationOnce((options: any) => {
      if (options?.path === '/api/v1/server/info') {
        return { isTestnet: true };
      }
      return previewResponse;
    });

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ derivationScheme: xpub })
      .expect(422);

    expect(response.body?.message).toContain('Network mismatch');
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when account key path coin type mismatches network', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-account-mismatch';
    const tpub = 'tpubD6NzVbkrYhZ4YACCOUNTMISMATCH123456789ABCDEFGHIJKLMNOPQRSTUV';

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ derivationScheme: tpub, accountKeyPath: "m/84'/0'/0'" })
      .expect(422);

    expect(response.body?.message).toContain('Account key path');
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
  });

  it('rejects payloads containing sensitive secrets', async () => {
    const csrfToken = await fetchCsrf();
    const storeId = 'store-sensitive';

    const response = await agent
      .post(`/api/stores/${storeId}/wallets/onchain/preview`)
      .set('x-csrf-token', csrfToken)
      .send({ derivationScheme: 'seed xpub6CUGR', accountKeyPath: "m/84'/1'/0'" })
      .expect(400);

    expect(response.body?.message).toContain('Never paste seeds or private keys');
    expect(btcpayProxy).toHaveBeenCalledTimes(1);
  });
});
