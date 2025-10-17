import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { resolveCookieNames } from '../src/auth/cookie-names';
import { UserEntity } from '../src/auth/entities/user.entity';
import { configureApp, configureCors, configureCsrfProtection } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { randomBytes } from 'crypto';

describe('Auth session hardening', () => {
  let cookieNames: ReturnType<typeof resolveCookieNames>;
  let app: INestApplication;
  let server: any;
  let dataSource: DataSource;

  const credentials = { email: 'session@example.com', password: 'averysecurepassword' };

  beforeAll(async () => {
    process.env.BTCPAY_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT ?? '5432';
    process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? 'postgres';
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'postgres';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB ?? 'paypay';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    cookieNames = resolveCookieNames();
    configureApp(app, env);
    configureCors(app, env);
    configureCsrfProtection(app, env);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: false, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer();
    dataSource = app.get(DataSource);

    const usersRepository = dataSource.getRepository(UserEntity);
    const passwordHash = await argon2.hash(credentials.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });

    const existing = usersRepository.create({
      email: credentials.email,
      passwordHash,
      btcpayUserId: 'session-user',
      btcpayApiKeyHash: null,
      btcpayApiKeyLabel: null,
      btcpayApiKeyPermissions: null
    });
    await usersRepository.save(existing);
  });

  afterAll(async () => {
    await app.close();
  });

  function createAgent(): ReturnType<typeof request.agent> {
    return request.agent(server);
  }

  function getCookies(response: Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  function addCookies(store: Map<string, string>, cookies: string[]): void {
    for (const cookie of cookies) {
      const [pair] = cookie.split(';', 1);
      if (!pair) continue;
      const [name, value] = pair.split('=');
      if (!name) continue;
      store.set(name.trim(), (value ?? '').trim());
    }
  }

  function serializeCookies(store: Map<string, string>): string[] {
    return Array.from(store.entries()).map(([name, value]) => `${name}=${value}`);
  }

  async function fetchCsrf(
    agent: ReturnType<typeof request.agent>
  ): Promise<{ token: string; cookies: string[] }> {
    const response = await agent.get('/api/auth/csrf').expect(200);
    expect(response.body).toEqual({ csrfToken: expect.any(String) });
    return { token: response.body.csrfToken, cookies: getCookies(response) };
  }

  it('issues a CSRF cookie and token', async () => {
    const agent = createAgent();
    const { cookies } = await fetchCsrf(agent);
    const secret = cookies.find((cookie) => cookie.startsWith(`${cookieNames.csrfSecret}=`));
    const legacySecret = cookies.find((cookie) => cookie.startsWith(`${cookieNames.legacyCsrfSecret}=`));
    const candidate = secret ?? legacySecret;
    expect(candidate).toBeDefined();
    if (candidate) {
      expect(candidate).toContain('SameSite=Lax');
    }
  });

  it('rejects login attempts without CSRF tokens', async () => {
    await request(server)
      .post('/api/auth/login')
      .send(credentials)
      .expect(403);
  });

  it('logs in with valid credentials and rotates cookies', async () => {
    const agent = createAgent();
    const { token: csrfToken, cookies: csrfCookies } = await fetchCsrf(agent);
    const cookieJar = new Map<string, string>();
    addCookies(cookieJar, csrfCookies);

    const loginResponse = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', serializeCookies(cookieJar))
      .send(credentials)
      .expect(204);

    const cookies = getCookies(loginResponse);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.access}=`))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.refresh}=`))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.legacyAccess}=`))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.legacyRefresh}=`))).toBe(true);

    addCookies(cookieJar, cookies);

    const meResponse = await agent
      .get('/api/auth/me')
      .set('Cookie', serializeCookies(cookieJar))
      .expect(200);
    expect(meResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );
  });

  it('does not issue cookies when credentials are invalid', async () => {
    const agent = createAgent();
    const { token: csrfToken, cookies: csrfCookies } = await fetchCsrf(agent);
    const cookieJar = new Map<string, string>();
    addCookies(cookieJar, csrfCookies);

    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', serializeCookies(cookieJar))
      .send({ email: credentials.email, password: 'wrongpassword123' })
      .expect(401);

    const cookies = getCookies(response);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.access}=`))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.refresh}=`))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.legacyAccess}=`))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith(`${cookieNames.legacyRefresh}=`))).toBe(false);
  });

  it('requires an access cookie to resolve the current user', async () => {
    await request(server).get('/api/auth/me').expect(401);
  });

  it('clears authentication cookies on logout', async () => {
    const agent = createAgent();
    const { token: csrfToken, cookies: csrfCookies } = await fetchCsrf(agent);
    const cookieJar = new Map<string, string>();
    addCookies(cookieJar, csrfCookies);

    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', serializeCookies(cookieJar))
      .send(credentials)
      .expect(204);

    const { token: logoutCsrf, cookies: logoutCookies } = await fetchCsrf(agent);
    addCookies(cookieJar, logoutCookies);
    const logoutResponse = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', logoutCsrf)
      .set('Cookie', serializeCookies(cookieJar))
      .send({})
      .expect(204);

    const cookies = getCookies(logoutResponse);
    expect(cookies.some((cookie) => /Max-Age=0/.test(cookie))).toBe(true);

    await agent.get('/api/auth/me').expect(401);
  });
});
