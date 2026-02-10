import { config } from "../config/environment";
import { RedisService } from "./redis-service";
import { DbService } from "./db-service";
import {
  AchievementWithType,
  Achieved,
  UpdateUserAchievementRequest,
  UserAchievement,
} from "../types";

export class CacheDbService {
  private static readonly CACHE_PREFIX_ACHIEVEMENTS = "achievements:";
  private static readonly CACHE_PREFIX_USER_ACHIEVED = "user_achieved:";
  private static readonly CACHE_TTL = config.cache.ttl;

  /** Cache key for channel achievement definitions (shared). */
  private static buildAchievementsCacheKey(channelId: string): string {
    return `${this.CACHE_PREFIX_ACHIEVEMENTS}${channelId}`;
  }

  /** Cache key for user achieved list on a channel. */
  private static buildUserAchievedCacheKey(
    userId: string,
    channelId: string,
  ): string {
    return `${this.CACHE_PREFIX_USER_ACHIEVED}${userId}:${channelId}`;
  }

  /** Merges definitions + achieved list and filters by type label; returns [] if none match. */
  private static mergeAndFilter(
    definitions: AchievementWithType[],
    achievedList: Achieved[],
    channelId: string,
    typeAchievementLabel: string,
  ): UserAchievement[] {
    const achievedByAchievementId = new Map<string, Achieved>(
      achievedList.map((a) => [a.achievementId, a]),
    );
    const merged = definitions.map((def) =>
      UserAchievement.fromMerged(
        def,
        achievedByAchievementId.get(def.id) ?? null,
        channelId,
      ),
    );
    return merged.filter(
      (u) => u.typeAchievement?.label === typeAchievementLabel,
    );
  }

  private static async tryGetFromCache(
    cacheKeyAchievements: string,
    cacheKeyUser: string,
    channelId: string,
    typeAchievement: string,
  ): Promise<UserAchievement[] | null> {
    const defs =
      await RedisService.get<AchievementWithType[]>(cacheKeyAchievements);
    const achieved = await RedisService.get<Achieved[]>(cacheKeyUser);
    if (!defs || achieved === null) return null;
    return this.mergeAndFilter(defs, achieved, channelId, typeAchievement);
  }

  static async getAchievements(
    channelId: string,
    userId: string,
    typeAchievement: string,
  ): Promise<UserAchievement[]> {
    const cacheKeyAchievements = this.buildAchievementsCacheKey(channelId);
    const cacheKeyUser = this.buildUserAchievedCacheKey(userId, channelId);

    const cached = await this.tryGetFromCache(
      cacheKeyAchievements,
      cacheKeyUser,
      channelId,
      typeAchievement,
    );
    if (cached) return cached;

    const lockKey = `read:lock:${cacheKeyUser}`;
    const maxLockAttempts = 15;
    const baseDelayMs = 50;
    const maxDelayMs = 500;

    let lockToken: string | false = false;
    for (let attempt = 0; attempt < maxLockAttempts; attempt++) {
      lockToken = await RedisService.acquireLock(lockKey, 10);
      if (lockToken) break;
      const delay = Math.min(baseDelayMs * (attempt + 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const retry = await this.tryGetFromCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
      );
      if (retry) return retry;
    }

    if (!lockToken) {
      const final = await this.tryGetFromCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
      );
      return final ?? [];
    }

    try {
      const again = await this.tryGetFromCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
      );
      if (again) return again;

      const apiResponse = await DbService.getUserAchievements(
        userId,
        channelId,
      );
      const definitions =
        apiResponse.length === 0
          ? await DbService.getAchievements(channelId)
          : apiResponse.map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              goal: item.goal,
              reward: item.reward,
              label: item.label,
              typeAchievement: item.typeAchievement,
            }));
      const achievedList =
        apiResponse.length === 0
          ? []
          : apiResponse
              .map((item) => item.achieved)
              .filter((a): a is Achieved => a !== null);

      await RedisService.set(cacheKeyAchievements, definitions, this.CACHE_TTL);
      await RedisService.set(cacheKeyUser, achievedList, this.CACHE_TTL);

      return this.mergeAndFilter(
        definitions,
        achievedList,
        channelId,
        typeAchievement,
      );
    } finally {
      if (lockToken) await RedisService.releaseLock(lockKey, lockToken);
    }
  }

  /** Updates only the achieved part in cache; marks for sync to DB on expiry. */
  static async update(userAchievement: UserAchievement): Promise<void> {
    const userId = userAchievement.achieved?.userId;
    if (!userId)
      throw new Error("UserAchievement.achieved is required for update");
    const channelId = userAchievement.channelId;
    const cacheKey = this.buildUserAchievedCacheKey(userId, channelId);
    const lockKey = `lock:${cacheKey}`;

    for (let attempt = 0; attempt < 10; attempt++) {
      const lockToken = await RedisService.acquireLock(lockKey, 10);
      if (!lockToken) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }

      try {
        let achievedList = await RedisService.get<Achieved[]>(cacheKey);

        if (achievedList === null) {
          const typeLabel = userAchievement.typeAchievement?.label ?? "";
          await this.getAchievements(channelId, userId, typeLabel);
          achievedList = (await RedisService.get<Achieved[]>(cacheKey)) ?? [];
        }

        const updated = userAchievement.toCacheAchieved();
        const idx = achievedList.findIndex(
          (a) => a.achievementId === userAchievement.id,
        );
        const newList =
          idx >= 0
            ? achievedList.map((a, i) => (i === idx ? updated : a))
            : [...achievedList, updated];

        await RedisService.set(cacheKey, newList, this.CACHE_TTL);
        await RedisService.addToSyncSet(cacheKey);
        await RedisService.storeSyncData(cacheKey, {
          userId,
          achievementId: userAchievement.id,
          data: {
            count: updated.count,
            finished: updated.finished,
            labelActive: updated.labelActive,
            acquiredDate: updated.acquiredDate,
          },
        });
        return;
      } finally {
        await RedisService.releaseLock(lockKey, lockToken);
      }
    }

    throw new Error(
      `Failed to acquire lock for cacheKey: ${cacheKey} after 10 attempts`,
    );
  }

  static async refreshExpiredCacheEntries(): Promise<void> {
    const pendingKeys = await RedisService.getPendingSyncKeys();

    for (const cacheKey of pendingKeys) {
      const lockKey = `sync:lock:${cacheKey}`;
      const lockToken = await RedisService.acquireLock(lockKey, 30);

      if (!lockToken) continue;

      try {
        const ttl = await RedisService.getTtl(cacheKey);
        const exists = await RedisService.exists(cacheKey);

        if (ttl > 0 && exists) continue;

        const syncDataList =
          await RedisService.getAllSyncDataForCacheKey(cacheKey);

        if (syncDataList.length === 0) {
          await RedisService.removeFromSyncSet(cacheKey);
          continue;
        }

        for (const syncData of syncDataList) {
          await DbService.putAchieved({
            achievementId: syncData.achievementId,
            userId: syncData.userId,
            ...(syncData.data as UpdateUserAchievementRequest),
          });
        }

        await RedisService.deleteAllSyncDataForCacheKey(cacheKey);
        await RedisService.removeFromSyncSet(cacheKey);
        if (await RedisService.exists(cacheKey))
          await RedisService.delete(cacheKey);
      } finally {
        await RedisService.releaseLock(lockKey, lockToken);
      }
    }
  }

  static async clearCacheByChannelId(channelId: string): Promise<void> {
    const achievementsKey = this.buildAchievementsCacheKey(channelId);
    await RedisService.delete(achievementsKey);

    const userAchievedPattern = `${this.CACHE_PREFIX_USER_ACHIEVED}*:${channelId}`;
    const userAchievedKeys =
      await RedisService.getKeysByPattern(userAchievedPattern);

    for (const cacheKey of userAchievedKeys) {
      await RedisService.removeFromSyncSet(cacheKey);
      await RedisService.deleteAllSyncDataForCacheKey(cacheKey);
      await RedisService.delete(`read:lock:${cacheKey}`);
      await RedisService.delete(`lock:${cacheKey}`);
      await RedisService.delete(`sync:lock:${cacheKey}`);
      await RedisService.delete(cacheKey);
    }
  }
}
