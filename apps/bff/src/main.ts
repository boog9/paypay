import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import express, { type Application, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { CSRF_SECRET_COOKIE_NAME } from './auth/auth.constants';
import { getEnv } from './config/env.validation';
import type { RawBodyRequest } from './http/raw-body-request';

type TrustProxySetting = string | number | boolean;

function parseTrustProxy(v?: string | number | boolean): TrustProxySetting {
  if (v === undefined) {
    return 'loopback';
  }
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'boolean') {
    return v;
  }
  const normalized = v.trim();
  if (normalized === '') {
    return 'loopback';
  }
  const lower = normalized.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  if (lower === 'loopback') return 'loopback';
  const num = Number(normalized);
  return Number.isNaN(num) ? normalized : num;
}

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const cookieDomain = (() => {
    const raw = env.PAYPAY_DOMAIN?.trim() ?? '.iddqd.in';
    if (!raw) {
      return '.iddqd.in';
    }
    return raw.startsWith('.') ? raw : `.${raw}`;
  })();

  const allowedOrigins =
    env.NODE_ENV === 'production'
      ? ['https://paypay.iddqd.in']
      : [env.FRONTEND_ORIGIN ?? 'http://localhost:3000'];

  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept'],
    exposedHeaders: ['X-CSRF-Token']
  });

  app.use(cookieParser(env.COOKIE_SECRET));

  const httpAdapter = app.getHttpAdapter();
  const type = httpAdapter.getType();
  const instance: unknown = httpAdapter.getInstance();
  const trustProxyValue = parseTrustProxy(env.TRUST_PROXY);

  if (type === 'fastify') {
    const fastifyInstance = instance as { trustProxy?: TrustProxySetting };
    fastifyInstance.trustProxy = trustProxyValue ?? 'loopback';
    // TODO: Provide a raw body hook for BTCPay webhooks if we migrate to the Fastify adapter.
  }

  if (type === 'express') {
    const expressInstance = instance as Application;
    const effectiveTrustProxyValue =
      trustProxyValue === undefined || trustProxyValue === null ? 'loopback' : trustProxyValue;
    // Ensure IP forwarding works correctly when running behind a layer 7 proxy.
    expressInstance.set('trust proxy', effectiveTrustProxyValue);

    const hooksPaths = ['/hooks/btcpay', '/api/hooks/btcpay'];
    const isBtcpayHookPath = (path: string) => hooksPaths.some((prefix) => path.startsWith(prefix));

    // 1) Keep BTCPay webhooks first with their dedicated parser so raw bodies remain intact.
    expressInstance.use(
      hooksPaths,
      express.json({
        limit: '1mb',
        type: ['application/json', 'application/*+json'],
        verify: (req: RawBodyRequest, _res, buf: Buffer) => {
          req.rawBody = Buffer.from(buf);
        }
      })
    );

    const jsonParser: RequestHandler = express.json({
      limit: '1mb',
      type: ['application/json', 'application/*+json']
    });
    const urlencodedParser: RequestHandler = express.urlencoded({ extended: false, limit: '1mb' });

    // 2) Apply global parsers to every other route so CSRF receives parsed bodies.
    expressInstance.use((req: RawBodyRequest, res: Response, next: NextFunction) => {
      const path = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.originalUrl || '';
      if (isBtcpayHookPath(path)) {
        return next();
      }
      jsonParser(req, res, (jsonErr?: unknown) => {
        if (jsonErr) {
          next(jsonErr as Error);
          return;
        }
        urlencodedParser(req, res, next);
      });
    });

    const csrfMiddleware = csurf({
      cookie: {
        key: CSRF_SECRET_COOKIE_NAME,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        signed: true,
        path: '/',
        domain: cookieDomain
      },
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
      value: (req: Request) => {
        const headerToken = req.headers['x-csrf-token'];
        return Array.isArray(headerToken) ? headerToken[0] : headerToken ?? '';
      }
    });

    expressInstance.use((req: Request, res: Response, next: NextFunction) => {
      const path = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.originalUrl || '';
      if (isBtcpayHookPath(path)) {
        return next();
      }
      return csrfMiddleware(req, res, next);
    });
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: false, forbidNonWhitelisted: true }));

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'healthz', method: RequestMethod.ALL },
      { path: 'readyz', method: RequestMethod.ALL }
    ]
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 BFF is running at http://0.0.0.0:${port}`);
}

void bootstrap();
