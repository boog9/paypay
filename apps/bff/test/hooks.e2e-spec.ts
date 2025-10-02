import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { json } from 'express';
import { AppModule } from '../src/app.module';

describe('BTCPay webhook CSRF bypass (e2e)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
    );

    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance();
    instance.use(
      ['/hooks/btcpay', '/api/hooks/btcpay'],
      json({
        verify: (req: any, _res, buf: Buffer) => {
          req.rawBody = Buffer.from(buf);
        }
      })
    );

    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts webhook requests that include BTCPAY-SIG without CSRF tokens', async () => {
    const response = await request(server)
      .post('/api/hooks/btcpay')
      .set('BTCPAY-SIG', 'sha256=test')
      .set('BTCPAY-DELIVERY', 'delivery-test')
      .send({ storeId: 'missing-store' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual(expect.objectContaining({ status: 'accepted' }));
  });
});
