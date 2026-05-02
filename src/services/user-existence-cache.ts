import { config } from "../config/environment";
import { DbService } from "./db-service";

interface Entry {
  exists: boolean;
  expiresAt: number;
}

export class UserExistenceCache {
  private static readonly cache = new Map<string, Entry>();

  static async exists(userId: string): Promise<boolean> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > now) return hit.exists;
    const exists = await DbService.userExists(userId);
    this.cache.set(userId, {
      exists,
      expiresAt: now + config.userExistenceCache.ttlMs,
    });
    return exists;
  }

  static invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  static clear(): void {
    this.cache.clear();
  }
}
