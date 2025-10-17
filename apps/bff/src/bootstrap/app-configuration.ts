import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import express, {
  type Application,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response
} from 'express';
import helmet from 'helmet';
import { CSRF_SECRET_COOKIE_NAME } from '../auth/auth.constants';
import { resolveCookieTarget } from '../auth/cookie.utils';
import type { RawBodyRequest } from '../http/raw-body-request';
import { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, CORS_EXPOSED_HEADERS } from '../config/cors.constants';
import type { getEnv } from '../config/env.validation';

type TrustProxySetting = string | number | boolean;

function parseTrustProxy(value?: string | number | boolean): TrustProxySetting {
  if (value === undefined) {
    return 'loopback';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'loopback';
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'false' || lowered === '0') {
    return false;
  }
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'loopback') {
    return 'loopback';
  }
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
}

function shouldBypassCsrf(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path || '/';

  if (normalizedPath === '/health' || normalizedPath === '/readyz' || normalizedPath === '/healthz') {
    return true;
  }

  if (normalizedPath.startsWith('/webhooks/')) {
    return true;
  }

  if (normalizedPath.startsWith('/api/webhooks/')) {
    return true;
  }

  if (normalizedPath.startsWith('/hooks/btcpay') || normalizedPath.startsWith('/api/hooks/btcpay')) {
    return true;
  }

  if (normalizedMethod === 'GET' && normalizedPath === '/api/auth/csrf') {
    return true;
  }

  return false;
}

export function configureApp(app: INestApplication, env: ReturnType<typeof getEnv>): void {
  app.use(helmet());
  app.use(cookieParser(env.COOKIE_SECRET));

  const httpAdapter = app.getHttpAdapter();
  const adapterType = httpAdapter.getType();
  const instance: unknown = httpAdapter.getInstance();

  const jsonParser: RequestHandler = express.json({
    limit: '1mb',
    type: ['application/json', 'application/*+json']
  });
  const urlencodedParser: RequestHandler = express.urlencoded({ extended: false, limit: '1mb' });

  const hooksPaths = ['/hooks/btcpay', '/api/hooks/btcpay'];
  const isBtcpayHookPath = (path: string) => hooksPaths.some((prefix) => path.startsWith(prefix));

  if (adapterType === 'fastify') {
    const fastifyInstance = instance as { trustProxy?: TrustProxySetting };
    fastifyInstance.trustProxy = parseTrustProxy(env.TRUST_PROXY) ?? 'loopback';
  }

  if (adapterType === 'express') {
    const expressInstance = instance as Application;
    const trustProxyValue = parseTrustProxy(env.TRUST_PROXY);
    const effectiveTrustProxy =
      trustProxyValue === undefined || trustProxyValue === null ? 'loopback' : trustProxyValue;
    expressInstance.set('trust proxy', effectiveTrustProxy);

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

    app.use((req: RawBodyRequest, res: Response, next: NextFunction) => {
      const path = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.originalUrl || '';
      if (isBtcpayHookPath(path)) {
        return next();
      }
      jsonParser(req, res, (jsonError?: unknown) => {
        if (jsonError) {
          next(jsonError as Error);
          return;
        }
        urlencodedParser(req, res, next);
      });
    });
  } else {
    app.use(jsonParser);
    app.use(urlencodedParser);
  }
}

export function configureCors(app: INestApplication, env: ReturnType<typeof getEnv>): void {
  app.enableCors({
    origin: env.FRONTEND_ORIGIN,
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}

export function configureCsrfProtection(
  app: INestApplication,
  env: ReturnType<typeof getEnv>
): void {
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter.getType() !== 'express') {
    return;
  }

  const expressInstance = httpAdapter.getInstance() as Application;
  const cookieTarget = resolveCookieTarget({
    frontendOrigin: env.FRONTEND_ORIGIN,
    fallbackDomain: env.PAYPAY_DOMAIN
  });

  const csrfMiddleware = csurf({
    cookie: {
      key: CSRF_SECRET_COOKIE_NAME,
      httpOnly: true,
      sameSite: 'lax',
      secure: !cookieTarget.isLocal,
      path: '/',
      ...(cookieTarget.domain ? { domain: cookieTarget.domain } : {})
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    value: (req: Request) =>
      Array.isArray(req.headers['x-csrf-token'])
        ? req.headers['x-csrf-token'][0]
        : req.headers['x-csrf-token'] ?? ''
  });

  expressInstance.use('/api/auth/csrf', csrfMiddleware);

  expressInstance.use((req: Request, res: Response, next: NextFunction) => {
    const path = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.originalUrl || '';
    if (shouldBypassCsrf(req.method, path)) {
      return next();
    }
    return csrfMiddleware(req, res, next);
  });
}
