import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { type Application, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import type { RawBodyRequest } from '../http/raw-body-request';
import { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, CORS_EXPOSED_HEADERS } from '../config/cors.constants';
import type { getEnv } from '../config/env.validation';

type TrustProxySetting = string | number | boolean;

function parseTrustProxy(value?: string | number | boolean): TrustProxySetting {
  if (value === undefined) {
    return 1;
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

export function configureApp(app: INestApplication, env: ReturnType<typeof getEnv>): void {
  app.use(helmet());
  app.use(cookieParser(env.COOKIE_SECRET));

  const httpAdapter = app.getHttpAdapter();
  const adapterType = httpAdapter.getType();
  const instance: unknown = httpAdapter.getInstance();

  const assignRawBody = (
    req: RawBodyRequest,
    _res: Response,
    buf: Buffer,
    _encoding: BufferEncoding
  ) => {
    void _encoding;
    req.rawBody = Buffer.from(buf);
  };

  const jsonParser: RequestHandler = express.json({
    limit: '1mb',
    type: ['application/json', 'application/*+json'],
    verify: assignRawBody
  });
  const urlencodedParser: RequestHandler = express.urlencoded({
    extended: false,
    limit: '1mb',
    verify: assignRawBody
  });

  if (adapterType === 'fastify') {
    const fastifyInstance = instance as { trustProxy?: TrustProxySetting };
    fastifyInstance.trustProxy = parseTrustProxy(env.TRUST_PROXY) ?? 'loopback';
  }

  if (adapterType === 'express') {
    const expressInstance = instance as Application;
    const trustProxyValue = parseTrustProxy(env.TRUST_PROXY);
    const effectiveTrustProxy = trustProxyValue ?? 1;
    expressInstance.set('trust proxy', effectiveTrustProxy);
  }

  app.use(jsonParser);
  app.use(urlencodedParser);
}

export function configureCors(app: INestApplication, env: ReturnType<typeof getEnv>): void {
  const allowedOrigin = env.FRONTEND_ORIGIN;
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      const isAllowed = !origin || origin === allowedOrigin;
      callback(null, isAllowed);
    },
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}
