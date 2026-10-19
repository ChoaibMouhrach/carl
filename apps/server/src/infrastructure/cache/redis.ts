import IORedis from "ioredis";
import { BaseCache } from "@server/lib/base-cache";
import type { BaseLogger } from "@server/lib/base-logger";

const KEY_PREFIX = "carl:cache:";

interface RedisCacheInit {
  logger: BaseLogger;
  redisUrl: string;
}

export class RedisCache extends BaseCache {
  private logger: BaseLogger;
  private redis: IORedis;

  public constructor(init: RedisCacheInit) {
    super();

    this.logger = init.logger;
    this.redis = new IORedis(init.redisUrl, { maxRetriesPerRequest: 1 });
    this.redis.on("error", (error) => {
      void this.logger.info({ cacheError: error.message });
    });
  }

  public async get(key: string) {
    try {
      return await this.redis.get(`${KEY_PREFIX}${key}`);
    } catch (error) {
      void this.logger.info({ cacheReadFailed: key, error: String(error) });
      return null;
    }
  }

  public async set(key: string, value: string, ttlSeconds: number) {
    try {
      await this.redis.set(`${KEY_PREFIX}${key}`, value, "EX", ttlSeconds);
    } catch (error) {
      void this.logger.info({ cacheWriteFailed: key, error: String(error) });
    }
  }

  public async close() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
