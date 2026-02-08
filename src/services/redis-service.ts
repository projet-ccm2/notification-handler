import { createClient, RedisClientType } from "redis";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class RedisService {
  private static client: RedisClientType | null = null;
  private static isConnected = false;

  static async connect(): Promise<void> {
    if (this.client && this.isConnected) return;

    const url = process.env.REDIS_URL ?? config.redis.url;
    this.client = createClient({ url });
    this.client.on("error", (err) => logger.error("Redis client error", { error: err.message }));
    this.client.on("connect", () => logger.info("Redis client connecting"));
    this.client.on("ready", () => {
      logger.info("Redis client ready");
      this.isConnected = true;
    });
    await this.client.connect();
  }

  static async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
    }
  }

  private static async ensureConnected(): Promise<void> {
    if (!this.client || !this.isConnected) await this.connect();
  }

  private static async execute<T>(fn: (client: RedisClientType) => Promise<T>): Promise<T> {
    await this.ensureConnected();
    if (!this.client) throw new Error("Redis client not initialized");
    return fn(this.client);
  }

  static async get<T>(key: string): Promise<T | null> {
    const value = await this.execute((c) => c.get(key));
    return value ? (JSON.parse(value) as T) : null;
  }

  static async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.execute((c) =>
      ttlSeconds ? c.setEx(key, ttlSeconds, serialized) : c.set(key, serialized)
    );
  }

  static async delete(key: string): Promise<void> {
    await this.execute((c) => c.del(key));
  }

  static async exists(key: string): Promise<boolean> {
    return (await this.execute((c) => c.exists(key))) === 1;
  }

  static async getTtl(key: string): Promise<number> {
    return this.execute((c) => c.ttl(key));
  }

  static async addToSyncSet(key: string): Promise<void> {
    await this.execute((c) => c.sAdd("sync:pending", key));
  }

  static async removeFromSyncSet(key: string): Promise<void> {
    await this.execute((c) => c.sRem("sync:pending", key));
  }

  static async getPendingSyncKeys(): Promise<string[]> {
    return this.execute((c) => c.sMembers("sync:pending"));
  }

  static async storeSyncData(
    cacheKey: string,
    syncData: { userId: string; achievementId: string; data: unknown }
  ): Promise<void> {
    const syncKey = `sync:data:${cacheKey}:${syncData.achievementId}`;
    await this.execute((c) =>
      c.setEx(syncKey, config.cache.ttl + 60, JSON.stringify(syncData))
    );
  }

  static async getSyncData(
    cacheKey: string,
    achievementId: string
  ): Promise<{ userId: string; achievementId: string; data: unknown } | null> {
    const syncKey = `sync:data:${cacheKey}:${achievementId}`;
    const value = await this.execute((c) => c.get(syncKey));
    return value ? (JSON.parse(value) as { userId: string; achievementId: string; data: unknown }) : null;
  }

  static async deleteSyncData(cacheKey: string, achievementId: string): Promise<void> {
    await this.execute((c) => c.del(`sync:data:${cacheKey}:${achievementId}`));
  }

  static async getAllSyncDataForCacheKey(cacheKey: string): Promise<
    Array<{ userId: string; achievementId: string; data: unknown }>
  > {
    const pattern = `sync:data:${cacheKey}:*`;
    const keys = await this.execute((c) => c.keys(pattern));
    const syncDataArray = [];

    for (const key of keys) {
      const value = await this.execute((c) => c.get(key));
      if (value) syncDataArray.push(JSON.parse(value));
    }

    return syncDataArray;
  }

  static async deleteAllSyncDataForCacheKey(cacheKey: string): Promise<void> {
    const pattern = `sync:data:${cacheKey}:*`;
    const keys = await this.execute((c) => c.keys(pattern));
    if (keys.length > 0) await this.execute((c) => c.del(keys));
  }

  static async acquireLock(lockKey: string, ttlSeconds: number = 10): Promise<boolean> {
    const result = await this.execute((c) => c.setNX(lockKey, "1"));
    if (result) {
      await this.execute((c) => c.expire(lockKey, ttlSeconds));
    }
    return result;
  }

  static async releaseLock(lockKey: string): Promise<void> {
    await this.execute((c) => c.del(lockKey));
  }
}
