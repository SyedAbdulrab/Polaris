import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Thin wrapper around ioredis with JSON-aware get/set helpers and per-user invalidation.
 * Cache keys are namespaced as `polaris:user:<userId>:<key>` so that one DEL pattern wipes a user.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private userKey(userId: string, key: string) {
    return `polaris:user:${userId}:${key}`;
  }

  async getJson<T>(userId: string, key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.userKey(userId, key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get failed: ${(err as Error).message}`);
      return null;
    }
  }

  async setJson<T>(
    userId: string,
    key: string,
    value: T,
    ttl = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    try {
      await this.redis.set(this.userKey(userId, key), JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      this.logger.warn(`cache set failed: ${(err as Error).message}`);
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    try {
      const pattern = `polaris:user:${userId}:*`;
      // SCAN avoids blocking Redis on large keyspaces.
      const stream = this.redis.scanStream({ match: pattern, count: 100 });
      const pipeline = this.redis.pipeline();
      let queued = 0;
      for await (const keys of stream) {
        for (const k of keys as string[]) {
          pipeline.del(k);
          queued++;
        }
      }
      if (queued > 0) await pipeline.exec();
    } catch (err) {
      this.logger.warn(`cache invalidate failed: ${(err as Error).message}`);
    }
  }
}
