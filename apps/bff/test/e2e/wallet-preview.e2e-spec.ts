import { randomBytes } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response, SuperAgentTest } from 'supertest';
import nock from 'nock';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp, configureCors } from '../../src/bootstrap/app-configuration';
import { getEnv } from '../../src/config/env.validation';
import { EnvelopeEncryptionService } from '../../src/security/envelope-encryption.service';
import { UserEntity } from '../../src/auth/entities/user.entity';
import { ManagedStoreEntity } from '../../src/stores/managed-store.entity';

describe('Wallet preview (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: SuperAgentTest;
  let dataSource: DataSource;
  let encryptionService: EnvelopeEncryptionService;

  function ensureMasterKey(): void {
    const current = process.env.BTCPAY_MASTER_KEY;
    if (current) {
      try {
        if (Buffer.from(current, 'base64').length === 32) {
          return;
        }
      } catch {
        // fall through to regeneration
      }
    }
    process.env.BTCPAY_MASTER_KEY = randomBytes(32).toString('base64');
  }

  function ensureDatabaseConfig(): void {
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
    process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? 'paypay';
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'paypay';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB ?? 'paypay';
  }

  function getCookies(response: Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  function formatCookieHeader(cookies: string[]): string {
    return cookies
      .map((cookie) => cookie.split(';')[0] ?? '')
      .filter((cookie) => cookie.length > 0)
      .join('; ');
  }

  beforeAll(async () => {
    ensureMasterKey();
    ensureDatabaseConfig();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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
    agent = request.agent(server) as unknown as SuperAgentTest;
    dataSource = app.get(DataSource);
    encryptionService = app.get(EnvelopeEncryptionService);
  });

  afterEach(async () => {
    nock.cleanAll();
    if (dataSource?.isInitialized) {
      await dataSource.getRepository(ManagedStoreEntity).createQueryBuilder().delete().execute();
      await dataSource.getRepository(UserEntity).createQueryBuilder().delete().execute();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function preparePreviewSession(label: string) {
    const usersRepository = dataSource.getRepository(UserEntity);
    const storesRepository = dataSource.getRepository(ManagedStoreEntity);
    const email = `preview-${label}@example.com`;
    const password = 'SecurePassword!234';

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });

    const user = usersRepository.create({
      email,
      passwordHash,
      btcpayUserId: `btcpay-user-${label}`,
      btcpayApiKeyHash: null,
      btcpayApiKeyLabel: null,
      btcpayApiKeyPermissions: null
    });
    await usersRepository.save(user);

    const storeApiKey = `store-api-key-${label}`;
    const encrypted = encryptionService.encrypt(storeApiKey);
    const store = storesRepository.create({
      userId: user.id,
      user,
      btcpayStoreId: `BTCPAY${label.toUpperCase()}`,
      storeName: `Preview Store ${label}`,
      defaultCurrency: 'BTC',
      btcpayHost: 'https://tenant-btcpay.example',
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyDekWrapped: encrypted.dekWrapped,
      webhookId: null,
      webhookSecretCiphertext: null,
      webhookSecretDekWrapped: null,
      storeKeyLastFour: storeApiKey.slice(-4),
      lastActiveAt: null
    });
    await storesRepository.save(store);

    const csrfResponse = await agent.get('/api/auth/csrf').expect(204);
    let cookies = getCookies(csrfResponse);
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    if (typeof csrfToken !== 'string') {
      throw new Error('Expected csrf token string');
    }

    const loginResponse = await agent
      .post('/api/auth/login')
      .set('Cookie', formatCookieHeader(cookies))
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password })
      .expect(204);

    cookies = cookies.concat(getCookies(loginResponse));

    const previewCsrf = await agent
      .get('/api/auth/csrf')
      .set('Cookie', formatCookieHeader(cookies))
      .expect(204);
    const previewToken = previewCsrf.headers['x-csrf-token'];
    if (typeof previewToken !== 'string') {
      throw new Error('Expected preview csrf token string');
    }

    cookies = cookies.concat(getCookies(previewCsrf));

    return {
      store,
      storeApiKey,
      cookieHeader: formatCookieHeader(cookies),
      csrfToken: previewToken
    };
  }

  it('returns on-chain preview addresses when BTCPay responds successfully', async () => {
    const { store, storeApiKey, cookieHeader, csrfToken } = await preparePreviewSession('success');

    const derivationScheme =
      "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";

    const scope = nock('https://tenant-btcpay.example')
      .post('/api/v1/stores/BTCPAYSUCCESS/payment-methods/BTC-CHAIN/wallet/preview', (body) => {
        expect(body).toEqual({
          derivationScheme: `wpkh(${derivationScheme}/0/*)`,
          accountKeyPath: null
        });
        return true;
      })
      .query((actual) => {
        expect(actual).toEqual({ offset: '0', count: '10' });
        return true;
      })
      .matchHeader('Authorization', `token ${storeApiKey}`)
      .reply(200, {
        addresses: [
          { address: 'tb1qpreview0000000000000000000000000000000000' },
          { address: 'tb1qpreview1111111111111111111111111111111111' }
        ]
      });

    const response = await agent
      .post(`/api/stores/${store.id}/wallets/onchain/preview`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme })
      .expect(200);

    expect(scope.isDone()).toBe(true);
    expect(response.body).toEqual({
      addresses: [
        { address: 'tb1qpreview0000000000000000000000000000000000' },
        { address: 'tb1qpreview1111111111111111111111111111111111' }
      ]
    });
  });

  it('returns validation error when BTCPay rejects the account key path', async () => {
    const { store, cookieHeader, csrfToken } = await preparePreviewSession('invalid');

    const derivationScheme =
      "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";

    const response = await agent
      .post(`/api/stores/${store.id}/wallets/onchain/preview`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme, accountKeyPath: "m/84'/1'/0'/0" })
      .expect(422);

    expect(response.body).toMatchObject({ message: "Account key path must follow m/84'/1'/account' format." });
  });

  it('surfaces payment method configuration errors from BTCPay', async () => {
    const { store, storeApiKey, cookieHeader, csrfToken } = await preparePreviewSession('notconfigured');

    const derivationScheme =
      "tpubDD5xrqbhiqeA6fm64AKHGp7q8C5fuRJK7hDmUf3JiWG9jKvRWMHSeGD9uZBizHqa56yVzRFvQ61R8o7LozB6QCxxeg9Tv3AgsUJGkZeYkbq";

    const scope = nock('https://tenant-btcpay.example')
      .post('/api/v1/stores/BTCPAYNOTCONFIGURED/payment-methods/BTC-CHAIN/wallet/preview', (body) => {
        expect(body).toEqual({
          derivationScheme: `wpkh(${derivationScheme}/0/*)`,
          accountKeyPath: null
        });
        return true;
      })
      .query((actual) => {
        expect(actual).toEqual({ offset: '0', count: '10' });
        return true;
      })
      .matchHeader('Authorization', `token ${storeApiKey}`)
      .reply(404, {
        code: 'paymentmethod-not-configured',
        message: 'Payment method not configured.'
      });

    const response = await agent
      .post(`/api/stores/${store.id}/wallets/onchain/preview`)
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ derivationScheme })
      .expect(422);

    expect(scope.isDone()).toBe(true);
    expect(response.body).toMatchObject({ message: 'Payment method is not configured yet.' });
  });
});
