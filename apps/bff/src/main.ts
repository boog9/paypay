import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import csrf from 'csurf';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { json } from 'express';
import { CSRF_SECRET_COOKIE_NAME } from './auth/auth.constants';

function parseTrustProxy(v?: string): any {
  if (v === undefined) {
    return 1;
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const defaultOrigin = 'https://paypay.iddqd.in';
  const configuredOrigins = configService
    .get<string>('FRONTEND_ORIGIN')
    ?.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const allowedOrigins = Array.from(new Set([defaultOrigin, ...(configuredOrigins ?? [])]));

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept'],
      exposedHeaders: ['X-CSRF-Token']
    })
  );

  const cookieSecret = configService.get<string>('COOKIE_SECRET');
  app.use(cookieParser(cookieSecret));

  const httpAdapter = app.getHttpAdapter();
  const type = httpAdapter.getType();
  const instance = httpAdapter.getInstance();
  const trustProxyRaw = configService.get<string>('TRUST_PROXY') ?? '1';
  const trustProxyValue = parseTrustProxy(trustProxyRaw);

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

    const csrfMiddleware = csrf({
      cookie: {
        key: CSRF_SECRET_COOKIE_NAME,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
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

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'healthz', method: RequestMethod.ALL },
      { path: 'readyz', method: RequestMethod.ALL }
    ]
  });

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 BFF is running at http://0.0.0.0:${port}`);
}

bootstrap();
