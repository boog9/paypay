import { randomBytes } from 'crypto';
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp, configureCors } from '../../src/bootstrap/app-configuration';
import { getEnv } from '../../src/config/env.validation';
import { resolveCookieNames } from '../../src/auth/cookie-names';
import { UserEntity } from '../../src/auth/entities/user.entity';

function hasHeaderValue(headerValue: string | string[] | undefined, expected: string): boolean {
  if (!headerValue) {
    return false;
  }
  const normalized = Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
  return normalized
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .includes(expected.toLowerCase());
}

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

function getCookies(response: request.Response): string[] {
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

describe('Public API routing (e2e)', () => {
  let app: INestApplication;
  let agent: request.SuperAgentTest;
  let server: any;
  let dataSource: DataSource;
  let env: ReturnType<typeof getEnv>;
  const cookieNames = resolveCookieNames();
  const credentials = { email: 'routing-test@example.com', password: 'StrongPassword!234' };

  beforeAll(async () => {
    ensureMasterKey();
    ensureDatabaseConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    env = getEnv();
    configureApp(app, env);
    configureCors(app, env);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: false, forbidNonWhitelisted: true })
    );
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'readyz', method: RequestMethod.ALL }
      ]
    });
    await app.init();

    server = app.getHttpServer();
    agent = request.agent(server) as unknown as request.SuperAgentTest;
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
      btcpayUserId: 'user-routing-check',
      btcpayApiKeyHash: 'hash',
      btcpayApiKeyLabel: 'label',
      btcpayApiKeyPermissions: '[]'
    });
    await usersRepository.save(existingUser);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes /health for liveness probes', async () => {
    await request(server).get('/health').expect(200);
  });

  it('serves auth routes exclusively through /api/*', async () => {
    const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
    expect(hasHeaderValue(csrfResponse.headers['access-control-expose-headers'], 'X-Csrf-Token')).toBe(
      true
    );
    const csrfHeader = csrfResponse.headers['x-csrf-token'];
    expect(typeof csrfHeader === 'string' && csrfHeader.length > 0).toBe(true);
    expect(csrfResponse.body).toEqual(
      expect.objectContaining({
        token: expect.any(String)
      })
    );
    const csrfToken = (csrfResponse.body.token ?? csrfResponse.body.csrfToken ?? csrfHeader).toString();
    let sessionCookies = getCookies(csrfResponse);

    const loginResponse = await agent
      .post('/api/auth/login')
      .set('Cookie', formatCookieHeader(sessionCookies))
      .set('X-CSRF-Token', csrfToken)
      .send(credentials)
      .expect(204);
    expect(loginResponse.text).toBe('');
    expect(loginResponse.body).toEqual({});

    const loginCookies = getCookies(loginResponse);
    sessionCookies = sessionCookies.concat(loginCookies);
    for (const name of [
      cookieNames.access,
      cookieNames.legacyAccess,
      cookieNames.refresh,
      cookieNames.legacyRefresh
    ]) {
      expect(loginCookies.some((cookie: string) => cookie.startsWith(`${name}=`))).toBe(true);
    }

    const meResponse = await agent
      .get('/api/auth/me')
      .set('Cookie', formatCookieHeader(sessionCookies))
      .expect(200);
    expect(meResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) })
      })
    );
  });
});
