import { createClient, RedisClientType } from "redis";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class RedisService {
  private static client: RedisClientType | null = null;
  private static isConnected = false;

  static async connect(): Promise<void> {
    if (this.client && this.isConnected) {
      return;
    }

    try {
      this.client = createClient({
        url: config.redis.url,
      });

      this.client.on("error", (err) => {
        logger.error("Redis client error", { error: err.message });
      });

      this.client.on("connect", () => {
        logger.info("Redis client connecting");
      });

      this.client.on("ready", () => {
        logger.info("Redis client ready");
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      logger.error("Failed to connect to Redis", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
    }
  }

  private static async ensureConnected(): Promise<void> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      await this.ensureConnected();
      if (!this.client) {
        throw new Error("Redis client not initialized");
      }

      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error("Redis get error", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await this.ensureConnected();
      if (!this.client) {
        throw new Error("Redis client not initialized");
      }

      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error("Redis set error", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async delete(key: string): Promise<void> {
    try {
      await this.ensureConnected();
      if (!this.client) {
        throw new Error("Redis client not initialized");
      }

      await this.client.del(key);
    } catch (error) {
      logger.error("Redis delete error", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      await this.ensureConnected();
      if (!this.client) {
        throw new Error("Redis client not initialized");
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error("Redis exists error", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
