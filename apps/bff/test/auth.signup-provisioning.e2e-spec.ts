import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Response } from 'supertest';
import nock from 'nock';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '../src/auth/auth.constants';
import { BTCPAY_PORTAL_USER_PERMISSIONS } from '../src/btcpay/btcpay.constants';
import { UserEntity } from '../src/auth/entities/user.entity';

describe('Auth signup provisioning (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: false,
        forbidNonWhitelisted: true
      })
    );
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    agent = request.agent(server);
    dataSource = app.get(DataSource);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(async () => {
    await app.close();
  });

  async function fetchCsrfToken(): Promise<{ token: string; cookies: string[] }> {
    const response = await agent.get('/api/auth/csrf-token').expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        csrfToken: expect.any(String)
      })
    );
    const cookies = getCookies(response);
    return { token: response.body.csrfToken, cookies };
  }

  function getCookies(response: Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  it('provisions a BTCPay user and API key, persisting only the hash', async () => {
    const email = 'provision@example.com';
    const password = 'averysecurepassword';
    const adminToken = process.env.BTCPAY_ADMIN_API_KEY ?? 'admin-token';
    const btcpayBase = process.env.BTCPAY_SERVER_URL ?? 'https://btcpay.local';
    const btcpayUrl = new URL(btcpayBase);
    const apiBasePath = btcpayUrl.pathname.replace(/\/$/, '');

    const invitationPath = '/invitations/accept?code=abc';
    const scope = nock(btcpayUrl.origin)
      .post(`${apiBasePath}/api/v1/users`, (body: any) => {
        expect(body).toEqual(
          expect.objectContaining({
            email,
            password,
            sendInvitationEmail: false
          })
        );
        return true;
      })
      .matchHeader('Authorization', `token ${adminToken}`)
      .reply(200, { id: 'user-provisioned', email })
      .get(`${apiBasePath}/api/v1/users/${encodeURIComponent(email)}`)
      .matchHeader('Authorization', `token ${adminToken}`)
      .reply(200, { invitationUrl: `${btcpayUrl.origin}${invitationPath}` })
      .get(invitationPath)
      .reply(302, undefined, { Location: '/login' })
      .post(`${apiBasePath}/api/v1/users/${encodeURIComponent(email)}/api-keys`, (body: any) => {
        expect(body).toEqual({ label: 'PayPay Portal', permissions: BTCPAY_PORTAL_USER_PERMISSIONS });
        return true;
      })
      .matchHeader('Authorization', `token ${adminToken}`)
      .matchHeader('Idempotency-Key', /.+/)
      .reply(200, {
        apiKey: 'btcpay-api-key',
        label: 'PayPay Portal',
        permissions: BTCPAY_PORTAL_USER_PERMISSIONS
      });

    const { token: csrfToken } = await fetchCsrfToken();
    const response = await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password })
      .expect(201);

    expect(scope.isDone()).toBe(true);
    expect(response.body).toEqual({ next: '/portal', apiKey: 'btcpay-api-key' });

    const cookies = getCookies(response);
    expect(cookies.length).toBeGreaterThan(0);
    const cookieHeader = cookies.join(';');
    expect(cookieHeader).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=`);
    expect(cookieHeader).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);
    expect(cookieHeader).toContain('Domain=.iddqd.in');

    const userRepository = dataSource.getRepository(UserEntity);
    const savedUser = await userRepository.findOneByOrFail({ email: email.toLowerCase() });
    expect(savedUser.btcpayApiKeyHash).toBeDefined();
    expect(savedUser.btcpayApiKeyHash).not.toEqual('btcpay-api-key');
    expect(savedUser.btcpayApiKeyLabel).toBe('PayPay Portal');
    expect(savedUser.btcpayApiKeyPermissions).toEqual(
      JSON.stringify([...BTCPAY_PORTAL_USER_PERMISSIONS].sort())
    );
    expect(await argon2.verify(savedUser.btcpayApiKeyHash!, 'btcpay-api-key')).toBe(true);
  });
});
