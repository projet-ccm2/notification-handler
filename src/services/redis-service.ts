import { randomUUID } from "node:crypto";
import { createClient, RedisClientType } from "redis";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export class RedisService {
  private static client: RedisClientType | null = null;
  private static isConnected = false;

  private static prefixKey(key: string): string {
    return `${config.nodeEnv}:${key}`;
  }

  static buildKey(key: string): string {
    return this.prefixKey(key);
  }

  private static stripPrefix(key: string): string {
    const prefix = `${config.nodeEnv}:`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
  }

  static async connect(): Promise<void> {
    if (this.client && this.isConnected) return;

    const url = process.env.REDIS_URL ?? config.redis.url;
    this.client = createClient({ url });
    this.client.on("error", (err) =>
      logger.error("Redis client error", { error: err.message }),
    );
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

  private static async execute<T>(
    fn: (client: RedisClientType) => Promise<T>,
  ): Promise<T> {
    await this.ensureConnected();
    if (!this.client) throw new Error("Redis client not initialized");
    return fn(this.client);
  }

  static async get<T>(key: string): Promise<T | null> {
    const value = await this.execute((c) => c.get(this.prefixKey(key)));
    return value ? (JSON.parse(value) as T) : null;
  }

  static async mGet(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.execute((c) => c.mGet(keys.map((k) => this.prefixKey(k))));
  }

  static async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    const prefixedKey = this.prefixKey(key);
    await this.execute((c) =>
      ttlSeconds
        ? c.setEx(prefixedKey, ttlSeconds, serialized)
        : c.set(prefixedKey, serialized),
    );
  }

  static async delete(key: string): Promise<void> {
    await this.execute((c) => c.del(this.prefixKey(key)));
  }

  private static async scanKeys(pattern: string): Promise<string[]> {
    const prefixedPattern = this.prefixKey(pattern);
    return this.execute(async (client) => {
      const keys: string[] = [];
      for await (const key of client.scanIterator({
        MATCH: prefixedPattern,
        COUNT: 100,
      })) {
        keys.push(this.stripPrefix(key));
      }
      return keys;
    });
  }

  static async getKeysByPattern(pattern: string): Promise<string[]> {
    return this.scanKeys(pattern);
  }

  static async exists(key: string): Promise<boolean> {
    return (await this.execute((c) => c.exists(this.prefixKey(key)))) === 1;
  }

  static async getTtl(key: string): Promise<number> {
    return this.execute((c) => c.ttl(this.prefixKey(key)));
  }

  static async addToSyncSet(key: string): Promise<void> {
    await this.execute((c) =>
      c.sAdd(this.prefixKey("sync:pending"), this.prefixKey(key)),
    );
  }

  static async removeFromSyncSet(key: string): Promise<void> {
    await this.execute((c) =>
      c.sRem(this.prefixKey("sync:pending"), this.prefixKey(key)),
    );
  }

  static async getPendingSyncKeys(): Promise<string[]> {
    const members = await this.execute((c) =>
      c.sMembers(this.prefixKey("sync:pending")),
    );
    return members.map((k) => this.stripPrefix(k));
  }

  static async storeSyncData(
    cacheKey: string,
    syncData: { userId: string; achievementId: string; data: unknown },
  ): Promise<void> {
    const syncKey = `sync:data:${cacheKey}:${syncData.achievementId}`;
    await this.execute((c) =>
      c.set(this.prefixKey(syncKey), JSON.stringify(syncData)),
    );
  }

  static async getSyncData(
    cacheKey: string,
    achievementId: string,
  ): Promise<{ userId: string; achievementId: string; data: unknown } | null> {
    const syncKey = `sync:data:${cacheKey}:${achievementId}`;
    const value = await this.execute((c) => c.get(this.prefixKey(syncKey)));
    return value
      ? (JSON.parse(value) as {
          userId: string;
          achievementId: string;
          data: unknown;
        })
      : null;
  }

  static async deleteSyncData(
    cacheKey: string,
    achievementId: string,
  ): Promise<void> {
    await this.execute((c) =>
      c.del(this.prefixKey(`sync:data:${cacheKey}:${achievementId}`)),
    );
  }

  static async getAllSyncDataForCacheKey(
    cacheKey: string,
  ): Promise<Array<{ userId: string; achievementId: string; data: unknown }>> {
    const pattern = `sync:data:${cacheKey}:*`;
    const keys = await this.scanKeys(pattern);
    if (keys.length === 0) return [];

    const values = await this.mGet(keys);
    return values
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v));
  }

  static async getSyncDataKeys(cacheKey: string): Promise<string[]> {
    return this.scanKeys(`sync:data:${cacheKey}:*`);
  }

  static async deleteAllSyncDataForCacheKey(cacheKey: string): Promise<void> {
    const keys = await this.getSyncDataKeys(cacheKey);
    if (keys.length > 0) {
      await this.execute((c) => c.del(keys.map((k) => this.prefixKey(k))));
    }
  }

  static async execPipeline(
    buildPipeline: (pipeline: ReturnType<RedisClientType["multi"]>) => void,
  ): Promise<void> {
    await this.execute((c) => {
      const pipeline = c.multi();
      buildPipeline(pipeline);
      return pipeline.exec();
    });
  }

  static async acquireLock(
    lockKey: string,
    ttlSeconds: number = 10,
  ): Promise<string | false> {
    const token = randomUUID();
    const result = await this.execute((c) =>
      c.set(this.prefixKey(lockKey), token, { NX: true, EX: ttlSeconds }),
    );
    return result === "OK" ? token : false;
  }

  static async releaseLock(lockKey: string, token: string): Promise<void> {
    await this.execute((c) =>
      c.eval(RELEASE_LOCK_SCRIPT, {
        keys: [this.prefixKey(lockKey)],
        arguments: [token],
      }),
    );
  }
}
