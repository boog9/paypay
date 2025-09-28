import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

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

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const frontendOrigin = configService.get<string>('FRONTEND_ORIGIN');
  const corsOrigins = frontendOrigin ? [frontendOrigin] : [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Accept']
  });

  const httpAdapter = app.getHttpAdapter();
  const type = httpAdapter.getType();
  const instance = httpAdapter.getInstance();
  const trustProxyRaw = configService.get<string>('TRUST_PROXY') ?? '1';
  const trustProxyValue = parseTrustProxy(trustProxyRaw);

  if (type === 'express' && typeof (instance as any).set === 'function') {
    (instance as any).set('trust proxy', trustProxyValue);
  } else if (type === 'fastify') {
    (instance as any).trustProxy = trustProxyValue;
  }

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'healthz', method: RequestMethod.ALL },
      { path: 'readyz', method: RequestMethod.ALL }
    ]
  });

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 BFF is running at http://0.0.0.0:${port}`);
}

bootstrap();
