import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, configureCors, configureCsrfProtection } from '../src/bootstrap/app-configuration';
import { getEnv } from '../src/config/env.validation';

describe('CORS preflight', () => {
  let app: INestApplication | undefined;
  let originalMasterKey: string | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (originalMasterKey === undefined) {
      delete process.env.BTCPAY_MASTER_KEY;
    } else {
      process.env.BTCPAY_MASTER_KEY = originalMasterKey;
    }
    originalMasterKey = undefined;
  });

  it('allows Idempotency-Key on POST /api/stores', async () => {
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost';
    process.env.POSTGRES_USER = process.env.POSTGRES_USER ?? 'postgres';
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'postgres';
    process.env.POSTGRES_DB = process.env.POSTGRES_DB ?? 'paypay';
    originalMasterKey = process.env.BTCPAY_MASTER_KEY;
    process.env.BTCPAY_MASTER_KEY = Buffer.alloc(32).toString('base64');
    const env = getEnv();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app, env);
    configureCors(app, env);
    configureCsrfProtection(app, env);
    await app.init();

    const server = app.getHttpServer();
    const res = await request(server)
      .options('/api/stores')
      .set('Origin', env.FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization, content-type, idempotency-key, x-csrf-token'
      );

    expect(res.status).toBe(204);
    const allowHeaders = (res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allowHeaders).toContain('idempotency-key');
    expect(res.headers['access-control-allow-origin']).toBe(env.FRONTEND_ORIGIN);
  });
});
