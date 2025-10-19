import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { resolveCookieNames } from '../src/auth/cookie-names';
import { UserEntity } from '../src/auth/entities/user.entity';
import { configureApp, configureCors } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';
import { StoresService } from '../src/stores/stores.service';

describe('Auth cookies (development configuration)', () => {
  let cookieNames: ReturnType<typeof resolveCookieNames>;
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  let dataSource: DataSource;

  const originalNodeEnv = process.env.NODE_ENV;
  const originalDomain = process.env.PAYPAY_DOMAIN;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.PAYPAY_DOMAIN = 'localhost';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    const env = getEnv();
    cookieNames = resolveCookieNames();
    configureApp(app, env);
    configureCors(app, env);
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

    const usersRepository = dataSource.getRepository(UserEntity);
    const passwordHash = await argon2.hash('averysecurepassword', {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });
    const existingUser = usersRepository.create({
      email: 'devcookies@example.com',
      passwordHash,
      btcpayUserId: 'user-devcookies',
      btcpayApiKeyHash: 'existing-hash',
      btcpayApiKeyLabel: 'Existing key',
      btcpayApiKeyPermissions: '[]'
    });
    await usersRepository.save(existingUser);
  });

  afterAll(async () => {
    await app.close();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalDomain === undefined) {
      delete process.env.PAYPAY_DOMAIN;
    } else {
      process.env.PAYPAY_DOMAIN = originalDomain;
    }
  });

  function getCookies(response: Response): string[] {
    const raw = response.headers['set-cookie'];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        csrfToken: expect.any(String)
      })
    );
    return response.body.csrfToken;
  }

  it('sets secure, lax cookies without a domain on localhost', async () => {
    const csrfToken = await fetchCsrfToken();
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'devcookies@example.com', password: 'averysecurepassword' })
      .expect(204);

    const cookies = getCookies(response);
    expect(cookies.length).toBeGreaterThan(0);

    const accessCookie = cookies.find((cookie) => cookie.startsWith(`${cookieNames.access}=`));
    const legacyAccessCookie = cookies.find((cookie) => cookie.startsWith(`${cookieNames.legacyAccess}=`));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith(`${cookieNames.refresh}=`));
    const legacyRefreshCookie = cookies.find((cookie) =>
      cookie.startsWith(`${cookieNames.legacyRefresh}=`)
    );

    expect(accessCookie ?? legacyAccessCookie).toBeDefined();
    expect(refreshCookie ?? legacyRefreshCookie).toBeDefined();

    expect((accessCookie ?? legacyAccessCookie)!).toMatch(/Max-Age=\d+/i);

    for (const cookie of [accessCookie, legacyAccessCookie, refreshCookie, legacyRefreshCookie]) {
      if (!cookie) continue;
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Secure');
      expect(cookie).not.toMatch(/Domain=/i);
    }
  });
});

describe('Auth cookies compatibility (production-like)', () => {
  let app: INestApplication;
  let server: any;
  let agent: ReturnType<typeof request.agent>;
  let dataSource: DataSource;
  let env: ReturnType<typeof getEnv>;
  let cookieNames: ReturnType<typeof resolveCookieNames>;
  const storesServiceMock = {
    listStores: jest.fn().mockResolvedValue([]),
    createStore: jest.fn().mockImplementation((dto: { name: string; defaultCurrency: string }) =>
      Promise.resolve({
        id: 'store-compat',
        name: dto.name,
        defaultCurrency: dto.defaultCurrency,
      })
    ),
  };

  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const cookieJar = new Map<string, string>();

  beforeAll(async () => {
    process.env.FRONTEND_ORIGIN = 'https://paypay.iddqd.in';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StoresService)
      .useValue(storesServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    env = getEnv();
    cookieNames = resolveCookieNames();
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
    const passwordHash = await argon2.hash('compat-password', {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const existingUser = usersRepository.create({
      email: 'compat@example.com',
      passwordHash,
      btcpayUserId: 'user-compat',
      btcpayApiKeyHash: 'hash',
      btcpayApiKeyLabel: 'label',
      btcpayApiKeyPermissions: '[]',
    });
    await usersRepository.save(existingUser);
  });

  afterAll(async () => {
    await app.close();
    if (originalFrontendOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN;
    } else {
      process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    }
  });

  beforeEach(() => {
    cookieJar.clear();
    storesServiceMock.listStores.mockClear();
    storesServiceMock.createStore.mockClear();
  });

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

  function serializeCookies(store: Map<string, string>): string {
    return Array.from(store.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  function buildCookieHeader(names: string[]): string {
    return names
      .map((name) => {
        const value = cookieJar.get(name);
        if (!value) {
          throw new Error(`Missing cookie ${name}`);
        }
        return `${name}=${value}`;
      })
      .join('; ');
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await agent.get('/api/auth/csrf').expect(200);
    addCookies(cookieJar, getCookies(response));
    return response.body.csrfToken;
  }

  async function login(): Promise<void> {
    const csrfToken = await fetchCsrfToken();
    const loginResponse = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', serializeCookies(cookieJar))
      .send({ email: 'compat@example.com', password: 'compat-password' })
      .expect(204);
    addCookies(cookieJar, getCookies(loginResponse));
  }

  async function prepareAuthContext(): Promise<string> {
    await login();
    return fetchCsrfToken();
  }

  it('authorizes requests that send __Host- cookies', async () => {
    const csrfToken = await prepareAuthContext();
    const cookieHeader = buildCookieHeader([cookieNames.access, cookieNames.csrfSecret]);

    await request(server)
      .post('/api/stores')
      .set('Origin', env.FRONTEND_ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookieHeader)
      .send({ name: 'Compat Store', defaultCurrency: 'USD' })
      .expect((res) => expect(res.status).not.toBe(401));
  });

  it('authorizes requests that rely on legacy pp.* cookies', async () => {
    const csrfToken = await prepareAuthContext();
    const cookieHeader = buildCookieHeader([
      cookieNames.legacyAccess,
      cookieNames.legacyCsrfSecret,
    ]);

    await request(server)
      .post('/api/stores')
      .set('Origin', env.FRONTEND_ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookieHeader)
      .send({ name: 'Compat Store Legacy', defaultCurrency: 'USD' })
      .expect((res) => expect(res.status).not.toBe(401));
  });

  it('rejects requests when authentication cookies are absent', async () => {
    const csrfToken = await prepareAuthContext();
    const cookieHeader = buildCookieHeader([cookieNames.csrfSecret]);

    await request(server)
      .post('/api/stores')
      .set('Origin', env.FRONTEND_ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookieHeader)
      .send({ name: 'Compat Store Missing', defaultCurrency: 'USD' })
      .expect(401);
  });
});
