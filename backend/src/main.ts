import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Strip unknown properties and coerce DTO types (spec §15.2 input validation).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS: in production restrict to app bundle IDs + admin domain (spec §15.2).
  app.enableCors({ origin: true, credentials: true });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Ziganya API listening on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
}

bootstrap();
