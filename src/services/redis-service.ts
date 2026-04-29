import { randomUUID } from "node:crypto";
import { createClient, RedisClientType } from "redis";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export class RedisService {
  private static client: RedisClientType | null = null;
  private static isConnected = false;
  private static disabled = false;

  static isAvailable(): boolean {
    return !this.disabled;
  }

  private static isLimitExceededError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("max requests limit exceeded");
  }

  private static handleLimitError(error: unknown): void {
    if (this.isLimitExceededError(error)) {
      if (!this.disabled) {
        this.disabled = true;
        logger.warn("Redis request limit exceeded, switching to no-cache mode", {
          context: "redis",
        });
      }
      return;
    }
    throw error;
  }

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
      logger.error("Redis client error", { error: err.message, context: "redis" }),
    );
    this.client.on("connect", () => logger.info("Redis client connecting", { context: "redis" }));
    this.client.on("ready", () => {
      logger.info("Redis client ready", { context: "redis" });
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
    if (this.disabled) return null;
    try {
      const value = await this.execute((c) => c.get(this.prefixKey(key)));
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.handleLimitError(error);
      return null;
    }
  }

  static async mGet(keys: string[]): Promise<(string | null)[]> {
    if (this.disabled) return keys.map(() => null);
    if (keys.length === 0) return [];
    try {
      return await this.execute((c) => c.mGet(keys.map((k) => this.prefixKey(k))));
    } catch (error) {
      this.handleLimitError(error);
      return keys.map(() => null);
    }
  }

  static async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    if (this.disabled) return;
    try {
      const serialized = JSON.stringify(value);
      const prefixedKey = this.prefixKey(key);
      await this.execute((c) =>
        ttlSeconds
          ? c.setEx(prefixedKey, ttlSeconds, serialized)
          : c.set(prefixedKey, serialized),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async delete(key: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) => c.del(this.prefixKey(key)));
    } catch (error) {
      this.handleLimitError(error);
    }
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
    if (this.disabled) return [];
    try {
      return await this.scanKeys(pattern);
    } catch (error) {
      this.handleLimitError(error);
      return [];
    }
  }

  static async exists(key: string): Promise<boolean> {
    if (this.disabled) return false;
    try {
      return (await this.execute((c) => c.exists(this.prefixKey(key)))) === 1;
    } catch (error) {
      this.handleLimitError(error);
      return false;
    }
  }

  static async getTtl(key: string): Promise<number> {
    if (this.disabled) return -1;
    try {
      return await this.execute((c) => c.ttl(this.prefixKey(key)));
    } catch (error) {
      this.handleLimitError(error);
      return -1;
    }
  }

  static async addToSyncSet(key: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) =>
        c.sAdd(this.prefixKey("sync:pending"), this.prefixKey(key)),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async removeFromSyncSet(key: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) =>
        c.sRem(this.prefixKey("sync:pending"), this.prefixKey(key)),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async getPendingSyncKeys(): Promise<string[]> {
    if (this.disabled) return [];
    try {
      const members = await this.execute((c) =>
        c.sMembers(this.prefixKey("sync:pending")),
      );
      return members.map((k) => this.stripPrefix(k));
    } catch (error) {
      this.handleLimitError(error);
      return [];
    }
  }

  static async storeSyncData(
    cacheKey: string,
    syncData: { userId: string; achievementId: string; data: unknown },
  ): Promise<void> {
    if (this.disabled) return;
    try {
      const syncKey = `sync:data:${cacheKey}:${syncData.achievementId}`;
      await this.execute((c) =>
        c.set(this.prefixKey(syncKey), JSON.stringify(syncData)),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async getSyncData(
    cacheKey: string,
    achievementId: string,
  ): Promise<{ userId: string; achievementId: string; data: unknown } | null> {
    if (this.disabled) return null;
    try {
      const syncKey = `sync:data:${cacheKey}:${achievementId}`;
      const value = await this.execute((c) => c.get(this.prefixKey(syncKey)));
      return value
        ? (JSON.parse(value) as {
            userId: string;
            achievementId: string;
            data: unknown;
          })
        : null;
    } catch (error) {
      this.handleLimitError(error);
      return null;
    }
  }

  static async deleteSyncData(
    cacheKey: string,
    achievementId: string,
  ): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) =>
        c.del(this.prefixKey(`sync:data:${cacheKey}:${achievementId}`)),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async getAllSyncDataForCacheKey(
    cacheKey: string,
  ): Promise<Array<{ userId: string; achievementId: string; data: unknown }>> {
    if (this.disabled) return [];
    try {
      const pattern = `sync:data:${cacheKey}:*`;
      const keys = await this.scanKeys(pattern);
      if (keys.length === 0) return [];
      const values = await this.mGet(keys);
      return values
        .filter((v): v is string => v !== null)
        .map((v) => JSON.parse(v));
    } catch (error) {
      this.handleLimitError(error);
      return [];
    }
  }

  static async getSyncDataKeys(cacheKey: string): Promise<string[]> {
    if (this.disabled) return [];
    try {
      return await this.scanKeys(`sync:data:${cacheKey}:*`);
    } catch (error) {
      this.handleLimitError(error);
      return [];
    }
  }

  static async deleteAllSyncDataForCacheKey(cacheKey: string): Promise<void> {
    if (this.disabled) return;
    try {
      const keys = await this.getSyncDataKeys(cacheKey);
      if (keys.length > 0) {
        await this.execute((c) => c.del(keys.map((k) => this.prefixKey(k))));
      }
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async execPipeline(
    buildPipeline: (pipeline: ReturnType<RedisClientType["multi"]>) => void,
  ): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) => {
        const pipeline = c.multi();
        buildPipeline(pipeline);
        return pipeline.exec();
      });
    } catch (error) {
      this.handleLimitError(error);
    }
  }

  static async acquireLock(
    lockKey: string,
    ttlSeconds: number = 10,
  ): Promise<string | false> {
    if (this.disabled) return false;
    try {
      const token = randomUUID();
      const result = await this.execute((c) =>
        c.set(this.prefixKey(lockKey), token, { NX: true, EX: ttlSeconds }),
      );
      return result === "OK" ? token : false;
    } catch (error) {
      this.handleLimitError(error);
      return false;
    }
  }

  static async releaseLock(lockKey: string, token: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.execute((c) =>
        c.eval(RELEASE_LOCK_SCRIPT, {
          keys: [this.prefixKey(lockKey)],
          arguments: [token],
        }),
      );
    } catch (error) {
      this.handleLimitError(error);
    }
  }
}
