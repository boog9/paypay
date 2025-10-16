import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { useContainer } from 'class-validator';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getEnv } from './config/env.validation';
import { configureApp } from './bootstrap/app-configuration';

async function bootstrap() {
  const env = getEnv();
  if (env.NODE_ENV === 'production' && !env.FRONTEND_ORIGIN) {
    throw new Error('FRONTEND_ORIGIN is required in production');
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  configureApp(app, env);

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
