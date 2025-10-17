import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import nock from 'nock';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  CSRF_SECRET_COOKIE_NAME
} from '../src/auth/auth.constants';
import { BTCPAY_PORTAL_USER_PERMISSIONS } from '../src/btcpay/btcpay.constants';
import { configureApp, configureCors, configureCsrfProtection } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    configureCsrfProtection(app, env);
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  async function fetchCsrfToken(): Promise<{ token: string; cookies: string[] }> {
    const response = await agent.get('/api/auth/csrf').expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        csrfToken: expect.any(String)
      })
    );
    const cookies = getCookies(response);
    return { token: response.body.csrfToken, cookies };
  }

  function extractCookieValue(cookies: string[] | undefined, name: string): string | undefined {
    if (!cookies) return undefined;
    const target = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    if (!target) return undefined;
    return target.split(';')[0].split('=').slice(1).join('=');
  }

  function getCookies(response: Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  it('should handle the full auth flow', async () => {
    const credentials = { email: 'merchant@example.com', password: 'averysecurepassword' };

    const { token: registerCsrf } = await fetchCsrfToken();
    const registerResponse = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', registerCsrf)
      .send(credentials)
      .expect(201);

    expect(registerResponse.body).toEqual(
      expect.objectContaining({ id: expect.any(String), email: credentials.email })
    );
    const registerCookies = getCookies(registerResponse);
    expect(registerCookies.join(';')).not.toContain(`${ACCESS_TOKEN_COOKIE_NAME}=`);
    expect(registerCookies.join(';')).not.toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);

    const { token: duplicateRegisterCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', duplicateRegisterCsrf)
      .send(credentials)
      .expect(409);

    const btcpayBase = process.env.BTCPAY_SERVER_URL ?? 'https://btcpay.local';
    const btcpayUrl = new URL(btcpayBase);
    const apiBasePath = btcpayUrl.pathname.replace(/\/$/, '');
    const adminToken = process.env.BTCPAY_ADMIN_API_KEY ?? 'admin-token';
    const signupEmail = 'second@example.com';
    const signupPassword = 'averysecurepassword';

    const invitationPath = '/invitations/accept?code=xyz';
    const expectedIdempotencyKey = createHash('sha256')
      .update(`create-api-key:${signupEmail.toLowerCase()}`)
      .digest('hex');

    const scope = nock(btcpayUrl.origin)
      .post(`${apiBasePath}/api/v1/users`, (body: any) => {
        expect(body).toEqual(
          expect.objectContaining({
            email: signupEmail,
            password: signupPassword,
            sendInvitationEmail: false
          })
        );
        return true;
      })
      .matchHeader('Authorization', `token ${adminToken}`)
      .reply(200, { id: 'user-second', email: signupEmail })
      .get(`${apiBasePath}/api/v1/users/${encodeURIComponent(signupEmail)}`)
      .matchHeader('Authorization', `token ${adminToken}`)
      .reply(200, { invitationUrl: `${btcpayUrl.origin}${invitationPath}` })
      .get(invitationPath)
      .reply(302, undefined, { Location: '/login' })
      .post(`${apiBasePath}/api/v1/users/${encodeURIComponent(signupEmail)}/api-keys`, (body: any) => {
        expect(body).toEqual({ label: 'PayPay Portal', permissions: BTCPAY_PORTAL_USER_PERMISSIONS });
        return true;
      })
      .matchHeader('Authorization', `token ${adminToken}`)
      .matchHeader('Idempotency-Key', expectedIdempotencyKey)
      .reply(200, {
        apiKey: 'btcpay-user-api-key',
        label: 'PayPay Portal',
        permissions: BTCPAY_PORTAL_USER_PERMISSIONS
      });

    const { token: signupCsrf } = await fetchCsrfToken();
    const signupResponse = await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', signupCsrf)
      .send({ email: signupEmail, password: signupPassword })
      .expect(201);

    expect(scope.isDone()).toBe(true);
    expect(signupResponse.body).toEqual(
      expect.objectContaining({
        next: '/dashboard',
        apiKey: 'btcpay-user-api-key'
      })
    );
    const signupCookies = getCookies(signupResponse);
    expect(signupCookies.join(';')).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=`);
    expect(signupCookies.join(';')).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);

    const { token: duplicateSignupCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', duplicateSignupCsrf)
      .send({ email: 'second@example.com', password: 'averysecurepassword' })
      .expect(409);

    const { token: invalidLoginCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', invalidLoginCsrf)
      .send({ ...credentials, password: 'wrongpassword123' })
      .expect(401);

    const { token: loginCsrf } = await fetchCsrfToken();
    const loginResponse = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', loginCsrf)
      .send(credentials)
      .expect(204);

    const meResponse = await agent.get('/api/auth/me').expect(200);
    expect(meResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );

    const loginCookies = getCookies(loginResponse);
    const firstRefreshToken = extractCookieValue(loginCookies, REFRESH_TOKEN_COOKIE_NAME);
    expect(firstRefreshToken).toBeDefined();

    const { token: refreshCsrf } = await fetchCsrfToken();
    const refreshedResponse = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', refreshCsrf)
      .send({})
      .expect(200);

    expect(refreshedResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );

    const refreshCookies = getCookies(refreshedResponse);
    const latestRefreshToken = extractCookieValue(refreshCookies, REFRESH_TOKEN_COOKIE_NAME);
    expect(latestRefreshToken).toBeDefined();
    expect(latestRefreshToken).not.toEqual(firstRefreshToken);

    const reuseCsrf = await fetchCsrfToken();
    const reuseCsrfSecret = extractCookieValue(reuseCsrf.cookies, CSRF_SECRET_COOKIE_NAME);
    expect(reuseCsrfSecret).toBeDefined();
    await request(server)
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', reuseCsrf.token)
      .set('Cookie', [
        `${REFRESH_TOKEN_COOKIE_NAME}=${firstRefreshToken}`,
        `${CSRF_SECRET_COOKIE_NAME}=${reuseCsrfSecret}`
      ])
      .send({ refreshToken: firstRefreshToken })
      .expect(401);

    const { token: logoutCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', logoutCsrf)
      .send({ refreshToken: latestRefreshToken })
      .expect(204);

    const { token: afterLogoutCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', afterLogoutCsrf)
      .send({ refreshToken: latestRefreshToken })
      .expect(401);
  });
});
