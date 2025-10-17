import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { useContainer } from 'class-validator';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, configureCors, configureCsrfProtection } from './bootstrap/app-configuration';
import { getEnv } from './config/env.validation';

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  configureApp(app, env);
  configureCors(app, env);
  configureCsrfProtection(app, env);

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
