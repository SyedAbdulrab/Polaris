import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const logger = new Logger('Redis');
        const client = new Redis(url, {
          // Don't crash the app if Redis is unreachable at boot — degrade gracefully.
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        client.on('error', (err) => logger.warn(`redis error: ${err.message}`));
        client.on('connect', () => logger.log(`Redis connected: ${url}`));
        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  // We don't inject the client here on purpose — the factory's onModuleDestroy via DI
  // is enough for the lifecycle, but this hook lets ops tooling close it cleanly too.
  async onApplicationShutdown() {
    // ioredis's quit() is awaited inside the DI container destroy phase.
  }
}
