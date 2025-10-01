import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  CSRF_SECRET_COOKIE_NAME
} from '../src/auth/auth.constants';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
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

    const { token: signupCsrf } = await fetchCsrfToken();
    const signupResponse = await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', signupCsrf)
      .send(credentials)
      .expect(201);

    expect(signupResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );
    const signupCookies = getCookies(signupResponse);
    expect(signupCookies.join(';')).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=`);
    expect(signupCookies.join(';')).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=`);

    const { token: duplicateCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/signup')
      .set('X-CSRF-Token', duplicateCsrf)
      .send(credentials)
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
      .expect(200);

    expect(loginResponse.body).toEqual(
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
      .expect(200);

    const { token: afterLogoutCsrf } = await fetchCsrfToken();
    await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', afterLogoutCsrf)
      .send({ refreshToken: latestRefreshToken })
      .expect(401);
  });
});
