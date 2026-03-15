import { config } from "../config/environment";
import { RedisService } from "./redis-service";
import { DbService } from "./db-service";
import { BadgeService } from "./badge-service";
import {
  AchievementWithType,
  Achieved,
  SyncDataForAchievement,
  TypeAchievement,
  UserAchievement,
} from "../types";

type DefinitionWithType = AchievementWithType & {
  typeAchievement: TypeAchievement;
};

export class CacheDbService {
  private static readonly CACHE_PREFIX_ACHIEVEMENTS = "achievements:";
  private static readonly CACHE_PREFIX_USER_ACHIEVED = "user_achieved:";
  private static readonly CACHE_TTL = config.cache.ttl;

  private static buildAchievementsCacheKey(channelId: string): string {
    return `${this.CACHE_PREFIX_ACHIEVEMENTS}${channelId}`;
  }

  private static buildUserAchievedCacheKey(
    userId: string,
    channelId: string,
  ): string {
    return `${this.CACHE_PREFIX_USER_ACHIEVED}${userId}:${channelId}`;
  }

  private static mergeAndFilter(
    definitions: AchievementWithType[],
    achievedList: Achieved[],
    channelId: string,
    typeAchievementLabel: string,
    userId: string,
  ): UserAchievement[] {
    const defsWithType = definitions.filter(
      (d): d is DefinitionWithType => d.typeAchievement != null,
    );
    const achievedByAchievementId = new Map<string, Achieved>(
      achievedList.map((a) => [a.achievementId, a]),
    );
    const merged = defsWithType.map((def) =>
      UserAchievement.fromMerged(
        def,
        achievedByAchievementId.get(def.id) ??
          UserAchievement.defaultAchieved(def.id, userId),
        channelId,
      ),
    );
    return merged.filter(
      (u) => u.typeAchievement.label === typeAchievementLabel,
    );
  }

  private static async tryGetFromCache(
    cacheKeyAchievements: string,
    cacheKeyUser: string,
    channelId: string,
    typeAchievement: string,
    userId: string,
  ): Promise<UserAchievement[] | null> {
    const defs =
      await RedisService.get<AchievementWithType[]>(cacheKeyAchievements);
    const achieved = await RedisService.get<Achieved[]>(cacheKeyUser);
    if (!defs || achieved === null) return null;
    return this.mergeAndFilter(
      defs,
      achieved,
      channelId,
      typeAchievement,
      userId,
    );
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
      userId,
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
        userId,
      );
      if (retry) return retry;
    }

    if (!lockToken) {
      const final = await this.tryGetFromCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
        userId,
      );
      return final ?? [];
    }

    try {
      const again = await this.tryGetFromCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
        userId,
      );
      if (again) return again;

      const apiResponse = await DbService.getUserAchievements(
        userId,
        channelId,
      );
      const itemsWithType =
        apiResponse.length === 0
          ? []
          : apiResponse.filter((item) => item.typeAchievement != null);
      const definitions =
        itemsWithType.length === 0
          ? await DbService.getAchievements(channelId)
          : itemsWithType.map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              goal: item.goal,
              reward: item.reward,
              label: item.label,
              typeAchievement: item.typeAchievement,
            }));
      const achievedList =
        itemsWithType.length === 0
          ? []
          : itemsWithType.map(
              (item) =>
                item.achieved ??
                UserAchievement.defaultAchieved(item.id, userId),
            );

      await RedisService.set(cacheKeyAchievements, definitions, this.CACHE_TTL);
      await RedisService.set(cacheKeyUser, achievedList, this.CACHE_TTL);

      return this.mergeAndFilter(
        definitions,
        achievedList,
        channelId,
        typeAchievement,
        userId,
      );
    } finally {
      if (lockToken) await RedisService.releaseLock(lockKey, lockToken);
    }
  }

  private static async tryGrantBadgeIfNewCompletion(
    userId: string,
    channelId: string,
    newList: Achieved[],
  ): Promise<void> {
    let definitions = await RedisService.get<AchievementWithType[]>(
      this.buildAchievementsCacheKey(channelId),
    );
    definitions ??= await DbService.getAchievements(channelId);
    const allFinished = definitions.every(
      (def) =>
        newList.find((a) => a.achievementId === def.id)?.finished === true,
    );
    if (allFinished) {
      await BadgeService.tryGrantBadge(userId, channelId);
    }
  }

  static async update(userAchievement: UserAchievement): Promise<void> {
    if (!userAchievement.achieved)
      throw new Error("UserAchievement.achieved is required for update");
    const userId = userAchievement.achieved.userId;
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
          await this.getAchievements(
            channelId,
            userId,
            userAchievement.typeAchievement.label,
          );
          achievedList = (await RedisService.get<Achieved[]>(cacheKey)) ?? [];
        }

        const updated = userAchievement.toCacheAchieved();
        const idx = achievedList.findIndex(
          (a) => a.achievementId === userAchievement.id,
        );
        const previousAchieved = idx >= 0 ? achievedList[idx] : undefined;
        const isNewCompletion =
          previousAchieved?.finished === false && updated.finished === true;
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
            ...(isNewCompletion && { rewardToAdd: userAchievement.reward }),
          },
        });

        if (isNewCompletion) {
          await this.tryGrantBadgeIfNewCompletion(userId, channelId, newList);
        }
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
          const data = syncData.data as SyncDataForAchievement;
          if (data.rewardToAdd != null) {
            await DbService.addExpToUser(syncData.userId, data.rewardToAdd);
          }
          await DbService.putAchieved({
            achievementId: syncData.achievementId,
            userId: syncData.userId,
            count: data.count,
            finished: data.finished,
            labelActive: data.labelActive,
            acquiredDate: data.acquiredDate,
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
