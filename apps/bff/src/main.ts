import 'reflect-metadata';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true
    })
  );

  const origin = configService.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({
    origin,
    credentials: true
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
