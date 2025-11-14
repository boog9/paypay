import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { resolveCookieNames } from '../src/auth/cookie-names';
import { UserEntity } from '../src/auth/entities/user.entity';

describe('AuthModule CSRF + Cookie flow (e2e)', () => {
  let app: INestApplication;
  let agent: request.SuperAgentTest;
  let server: any;
  let dataSource: DataSource;
  const cookieNames = resolveCookieNames();
  const credentials = { email: 'merchant@example.com', password: 'SuperSafe!1234' };

  beforeAll(async () => {
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
    agent = request.agent(server);
    dataSource = app.get(DataSource);

    const usersRepository = dataSource.getRepository(UserEntity);
    const passwordHash = await argon2.hash(credentials.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });
    const existingUser = usersRepository.create({
      email: credentials.email,
      passwordHash,
      btcpayUserId: 'user-auth-flow',
      btcpayApiKeyHash: 'hash',
      btcpayApiKeyLabel: 'label',
      btcpayApiKeyPermissions: '[]'
    });
    await usersRepository.save(existingUser);
  });

  afterAll(async () => {
    await app.close();
  });

  function getCookies(response: request.Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  function readCsrfToken(response: request.Response): string {
    const token = response.headers['x-csrf-token'];
    if (typeof token !== 'string') {
      throw new Error('Expected x-csrf-token header to be a string');
    }
    return token;
  }

  it('throttles repeated login attempts from the same IP address', async () => {
    const throttledIp = '198.51.100.77';
    const csrfResponse = await agent
      .get('/api/auth/csrf')
      .set('X-Forwarded-For', throttledIp)
      .expect(204);
    const csrfToken = readCsrfToken(csrfResponse);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await agent
        .post('/api/auth/login')
        .set('X-Forwarded-For', throttledIp)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: credentials.email, password: 'definitely-wrong' });
      expect(response.status).toBe(401);
    }

    await agent
      .post('/api/auth/login')
      .set('X-Forwarded-For', throttledIp)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: credentials.email, password: 'definitely-wrong' })
      .expect(429);
  });

  it('supports CSRF-protected cookie authentication flow', async () => {
    const csrfResponse = await agent.get('/api/auth/csrf').expect(204);
    const csrfCookies = getCookies(csrfResponse);
    expect(
      csrfCookies.some((cookie) => cookie.startsWith(`${cookieNames.csrfSecret}=`))
    ).toBe(true);
    const csrfToken = readCsrfToken(csrfResponse);
    expect(typeof csrfToken).toBe('string');

    const loginResponse = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send(credentials)
      .expect(204);

    const loginCookies = getCookies(loginResponse);
    const expectedCookieNames = [
      cookieNames.access,
      cookieNames.refresh,
    ];
    for (const name of expectedCookieNames) {
      const matching = loginCookies.filter((cookie) => cookie.startsWith(`${name}=`));
      expect(matching.length).toBeGreaterThan(0);
      for (const cookie of matching) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
      }
    }

    const meResponse = await agent.get('/api/auth/me').expect(200);
    expect(meResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );

    const missingHeaderResponse = await agent.post('/api/auth/refresh').expect(403);
    expect(missingHeaderResponse.body).toEqual(
      expect.objectContaining({ message: 'invalid csrf token' })
    );

    const freshAgent = request.agent(server);
    const freshCsrf = await freshAgent.get('/api/auth/csrf').expect(204);
    const freshCsrfToken = readCsrfToken(freshCsrf);
    expect(typeof freshCsrfToken).toBe('string');
    const refreshWithoutCookie = await freshAgent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', freshCsrfToken)
      .expect(401);
    expect(refreshWithoutCookie.body).toEqual(
      expect.objectContaining({ message: 'Refresh token is required.' })
    );

    const refreshCsrf = await agent.get('/api/auth/csrf').expect(204);
    const refreshToken = readCsrfToken(refreshCsrf);
    expect(typeof refreshToken).toBe('string');
    const refreshResponse = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', refreshToken)
      .expect(200);
    expect(refreshResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );

    const refreshCookies = getCookies(refreshResponse);
    for (const name of expectedCookieNames) {
      expect(refreshCookies.some((cookie) => cookie.startsWith(`${name}=`))).toBe(true);
    }

    const unauthorizedMe = await request(server).get('/api/auth/me').expect(401);
    expect(unauthorizedMe.body).toEqual(
      expect.objectContaining({ message: 'Access token is required.' })
    );
  });
});
