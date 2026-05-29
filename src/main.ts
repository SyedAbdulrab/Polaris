// MUST be first — initializes Sentry before any other module loads so it can
// instrument HTTP/Express/Postgres. Do not move this below other imports.
import './instrument';

import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.set('trust proxy', true);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Versioned API lives under /api/v1/*. A few routes opt out:
  //  - root info `/`
  //  - `/health` (cloud load balancers want this unversioned)
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const swagger = new DocumentBuilder()
    .setTitle('Polaris API')
    .setDescription('Personal life-metrics tracker. Finances, streaks, goals, mood logs.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  // Spec wants /api/docs explicitly.
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(config.get('PORT')) || 3000;
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`Polaris is live on http://localhost:${port}  |  docs: /api/docs`);
}

bootstrap();
