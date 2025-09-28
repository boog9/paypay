import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const origin = configService.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({
    origin,
    credentials: true,
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    optionsSuccessStatus: 204
  });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'healthz', method: RequestMethod.ALL },
      { path: 'readyz', method: RequestMethod.ALL }
    ]
  });

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
  logger.log(`🚀 BFF is running at http://0.0.0.0:${port}`);
}

bootstrap();
