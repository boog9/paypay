import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { json } from 'express';
import { CSRF_SECRET_COOKIE_NAME } from './auth/auth.constants';
import { getEnv } from './config/env.validation';

function parseTrustProxy(v?: string | number | boolean): any {
  if (v === undefined) {
    return 1;
  }
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'boolean') {
    return v;
  }
  const normalized = v.trim();
  if (normalized === '') {
    return 1;
  }
  const lower = normalized.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  const num = Number(normalized);
  return Number.isNaN(num) ? normalized : num;
}

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const defaultOrigin = 'https://paypay.iddqd.in';
  const configuredOrigins = env.FRONTEND_ORIGIN.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const allowedOrigins = Array.from(new Set([defaultOrigin, ...configuredOrigins]));

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
  const instance = httpAdapter.getInstance();
  const trustProxyValue = parseTrustProxy(env.TRUST_PROXY);

  if (type === 'fastify') {
    (instance as any).trustProxy = trustProxyValue;
  }

  if (type === 'express') {
    const expressInstance = instance as unknown as {
      use: (path: any, ...handlers: any[]) => void;
      set: (setting: string, value: any) => void;
    };
    const effectiveTrustProxyValue = trustProxyValue === false ? 1 : trustProxyValue;
    // Ensure IP forwarding works correctly when running behind a layer 7 proxy.
    expressInstance.set('trust proxy', effectiveTrustProxyValue ?? 1);
    expressInstance.use(
      ['/hooks/btcpay', '/api/hooks/btcpay'],
      json({
        verify: (req: any, _res, buf: Buffer) => {
          req.rawBody = Buffer.from(buf);
        }
      })
    );

    const csrfMiddleware = csurf({
      cookie: {
        key: CSRF_SECRET_COOKIE_NAME,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        signed: true,
        path: '/'
      },
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
      value: (req: Request) => {
        const headerToken = req.headers['x-csrf-token'];
        return Array.isArray(headerToken) ? headerToken[0] : headerToken ?? '';
      }
    });

    expressInstance.use((req: Request, res: Response, next: NextFunction) => {
      const path = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.originalUrl || '';
      if (path.startsWith('/hooks/btcpay') || path.startsWith('/api/hooks/btcpay')) {
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

bootstrap();
