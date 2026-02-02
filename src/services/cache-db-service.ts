import { config } from "../config/environment";
import { RedisService } from "./redis-service";
import { DbService } from "./db-service";
import { Achievement, UserAchievement, UpdateUserAchievementRequest } from "../types";

type SyncData = { userId: string; achievementId: string; data: unknown };

export class CacheDbService {
  private static readonly CACHE_PREFIX_ACHIEVEMENTS = "achievements:";
  private static readonly CACHE_PREFIX_USER_ACHIEVEMENTS = "user_achievements:";
  private static readonly CACHE_TTL = config.cache.ttl;

  static buildAchievementsCacheKey(channelId: string): string {
    return `${this.CACHE_PREFIX_ACHIEVEMENTS}${channelId}`;
  }

  static buildUserAchievementsCacheKey(userId: string, channelId: string): string {
    return `${this.CACHE_PREFIX_USER_ACHIEVEMENTS}${userId}:${channelId}`;
  }

  static async getAchievements(channelId: string): Promise<Achievement[]> {
    const cacheKey = this.buildAchievementsCacheKey(channelId);
    const cached = await RedisService.get<Achievement[]>(cacheKey);
    if (cached) return cached;

    const data = await DbService.getAchievements(channelId);
    await RedisService.set(cacheKey, data, this.CACHE_TTL);
    return data;
  }

  static async getUserAchievements(userId: string, channelId: string): Promise<UserAchievement[]> {
    const cacheKey = this.buildUserAchievementsCacheKey(userId, channelId);
    const lockKey = `read:lock:${cacheKey}`;
    
    let cached = await RedisService.get<UserAchievement[]>(cacheKey);
    if (cached) return cached;

    const lockAcquired = await RedisService.acquireLock(lockKey, 10);
    if (!lockAcquired) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      cached = await RedisService.get<UserAchievement[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      cached = await RedisService.get<UserAchievement[]>(cacheKey);
      if (cached) return cached;

      const data = await DbService.getUserAchievements(userId, channelId);
      await RedisService.set(cacheKey, data, this.CACHE_TTL);
      return data;
    } finally {
      if (lockAcquired) await RedisService.releaseLock(lockKey);
    }
  }

  static async updateUserAchievement(
    userId: string,
    achievementId: string,
    channelId: string,
    data: UpdateUserAchievementRequest
  ): Promise<void> {
    const cacheKey = this.buildUserAchievementsCacheKey(userId, channelId);
    const lockKey = `lock:${cacheKey}`;
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const lockAcquired = await RedisService.acquireLock(lockKey, 10);
      if (!lockAcquired) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }

      try {
        let achievements = await RedisService.get<UserAchievement[]>(cacheKey);
        
        if (!achievements) {
          achievements = await this.getUserAchievements(userId, channelId);
          achievements = await RedisService.get<UserAchievement[]>(cacheKey) || achievements;
        }

        const updatedAchievements = achievements.map((a) =>
          a.achievementId === achievementId ? { ...a, ...data } : a
        );

        await RedisService.set(cacheKey, updatedAchievements, this.CACHE_TTL);
        await RedisService.addToSyncSet(cacheKey);
        await RedisService.storeSyncData(cacheKey, { userId, achievementId, data });
        return;
      } finally {
        await RedisService.releaseLock(lockKey);
      }
    }
    
    throw new Error(`Failed to acquire lock for cacheKey: ${cacheKey} after 10 attempts`);
  }

  static async refreshExpiredCacheEntries(): Promise<void> {
    const pendingKeys = await RedisService.getPendingSyncKeys();
    
    for (const cacheKey of pendingKeys) {
      const lockKey = `sync:lock:${cacheKey}`;
      const lockAcquired = await RedisService.acquireLock(lockKey, 30);
      
      if (!lockAcquired) continue;

      try {
        const ttl = await RedisService.getTtl(cacheKey);
        const exists = await RedisService.exists(cacheKey);
        
        if (ttl > 0 && exists) continue;

        const syncDataList = await RedisService.getAllSyncDataForCacheKey(cacheKey);
        
        if (syncDataList.length === 0) {
          await RedisService.removeFromSyncSet(cacheKey);
          continue;
        }

        for (const syncData of syncDataList) {
          await DbService.updateUserAchievement(
            syncData.userId,
            syncData.achievementId,
            syncData.data as UpdateUserAchievementRequest
          );
        }

        await RedisService.deleteAllSyncDataForCacheKey(cacheKey);
        await RedisService.removeFromSyncSet(cacheKey);
        if (await RedisService.exists(cacheKey)) await RedisService.delete(cacheKey);
      } finally {
        await RedisService.releaseLock(lockKey);
      }
    }
  }
}
