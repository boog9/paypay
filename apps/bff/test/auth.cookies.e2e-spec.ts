import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '../src/auth/auth.constants';
import { UserEntity } from '../src/auth/entities/user.entity';
import { configureApp, configureCors, configureCsrfProtection } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';

describe('Auth cookies (development configuration)', () => {
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

  it('sets lax, non-secure cookies without a domain on localhost', async () => {
    const csrfToken = await fetchCsrfToken();
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'devcookies@example.com', password: 'averysecurepassword' })
      .expect(204);

    const cookies = getCookies(response);
    expect(cookies.length).toBeGreaterThan(0);

    const accessCookie = cookies.find((cookie) => cookie.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`));

    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    expect(accessCookie).toMatch(/Max-Age=\d+/i);

    for (const cookie of [accessCookie!, refreshCookie!]) {
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
      expect(cookie).not.toMatch(/Domain=/i);
    }
  });
});
