import { config } from "../config/environment";
import { RedisService } from "./redis-service";
import { DbService } from "./db-service";
import { BadgeService } from "./badge-service";
import { TwitchChatService } from "./twitch-chat-service";
import { DiscordNotificationService } from "./discord-notification-service";
import { logger } from "../utils/logger";
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
    const [rawDefs, rawAchieved] = await RedisService.mGet([
      cacheKeyAchievements,
      cacheKeyUser,
    ]);
    if (!rawDefs || rawAchieved === null) return null;
    const defs = JSON.parse(rawDefs) as AchievementWithType[];
    const achieved = JSON.parse(rawAchieved) as Achieved[];
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
    ctx: { channelLogin?: string; userLogin?: string },
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
      if (ctx.channelLogin && ctx.userLogin) {
        await TwitchChatService.sendBadgeGranted(
          ctx.channelLogin,
          ctx.userLogin,
        );
      }
    }
  }

  static async update(
    userAchievement: UserAchievement,
    ctx: { channelLogin?: string; userLogin?: string } = {},
  ): Promise<void> {
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
          previousAchieved?.finished !== true && updated.finished === true;
        if (updated.finished && !updated.acquiredDate) {
          updated.acquiredDate = new Date().toISOString();
        }
        const newList =
          idx >= 0
            ? achievedList.map((a, i) => (i === idx ? updated : a))
            : [...achievedList, updated];

        const existingSyncData = await RedisService.getSyncData(
          cacheKey,
          userAchievement.id,
        );
        const preservedReward = (
          existingSyncData?.data as SyncDataForAchievement
        )?.rewardToAdd;
        const rewardToAdd = isNewCompletion
          ? userAchievement.reward
          : preservedReward;
        const syncData = JSON.stringify({
          userId,
          achievementId: userAchievement.id,
          data: {
            count: updated.count,
            finished: updated.finished,
            labelActive: updated.labelActive,
            acquiredDate: updated.acquiredDate,
            ...(rewardToAdd != null && { rewardToAdd }),
          },
        });
        const syncKey = `sync:data:${cacheKey}:${userAchievement.id}`;
        await RedisService.execPipeline((p) => {
          p.setEx(
            RedisService.buildKey(cacheKey),
            this.CACHE_TTL,
            JSON.stringify(newList),
          );
          p.sAdd(
            RedisService.buildKey("sync:pending"),
            RedisService.buildKey(cacheKey),
          );
          p.set(RedisService.buildKey(syncKey), syncData);
        });

        if (isNewCompletion) {
          const userLogin = ctx.userLogin ?? "Un utilisateur";
          logger.info("Achievement newly completed, sending notifications", {
            userId,
            channelId,
            achievementId: userAchievement.id,
            achievementTitle: userAchievement.title,
            userLogin,
            channelLogin: ctx.channelLogin,
          });
          await Promise.all([
            this.tryGrantBadgeIfNewCompletion(userId, channelId, newList, ctx),
            ...(ctx.channelLogin
              ? [
                  TwitchChatService.sendAchievementUnlocked(
                    ctx.channelLogin,
                    userLogin,
                    userAchievement.title,
                  ),
                ]
              : []),
            DiscordNotificationService.sendAchievementUnlocked(
              channelId,
              userLogin,
              userAchievement.title,
            ),
          ]);
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

  static async refreshExpiredCacheEntries(force = false): Promise<void> {
    const pendingKeys = await RedisService.getPendingSyncKeys();

    for (const cacheKey of pendingKeys) {
      const lockKey = `sync:lock:${cacheKey}`;
      const lockToken = await RedisService.acquireLock(lockKey, 30);

      if (!lockToken) continue;

      try {
        const ttl = await RedisService.getTtl(cacheKey);

        if (!force && ttl > 0) continue;

        logger.debug("Cache TTL expired, starting flush to DB", {
          cacheKey,
          ttl,
        });

        const syncDataList =
          await RedisService.getAllSyncDataForCacheKey(cacheKey);

        if (syncDataList.length === 0) {
          logger.debug("No sync data to flush, removing from sync set", {
            cacheKey,
          });
          await RedisService.removeFromSyncSet(cacheKey);
          continue;
        }

        for (const syncData of syncDataList) {
          const data = syncData.data as SyncDataForAchievement;
          if (data.rewardToAdd != null) {
            logger.debug("Flushing exp to DB gateway", {
              userId: syncData.userId,
              rewardToAdd: data.rewardToAdd,
            });
            await DbService.addExpToUser(syncData.userId, data.rewardToAdd);
          }
          logger.debug("Flushing achieved to DB gateway", {
            userId: syncData.userId,
            achievementId: syncData.achievementId,
          });
          await DbService.saveAchieved({
            achievementId: syncData.achievementId,
            userId: syncData.userId,
            count: data.count,
            finished: data.finished,
            labelActive: data.labelActive,
            acquiredDate: data.acquiredDate,
          });
        }

        logger.debug("Flush complete, cleaning up sync data", {
          cacheKey,
          syncedCount: syncDataList.length,
        });
        const syncKeys = await RedisService.getSyncDataKeys(cacheKey);
        await RedisService.execPipeline((p) => {
          for (const k of syncKeys) {
            p.del(RedisService.buildKey(k));
          }
          p.sRem(
            RedisService.buildKey("sync:pending"),
            RedisService.buildKey(cacheKey),
          );
          p.del(RedisService.buildKey(cacheKey));
        });
      } finally {
        await RedisService.releaseLock(lockKey, lockToken);
      }
    }
  }

  static async clearCacheByChannelId(channelId: string): Promise<void> {
    const achievementsKey = this.buildAchievementsCacheKey(channelId);

    const userAchievedPattern = `${this.CACHE_PREFIX_USER_ACHIEVED}*:${channelId}`;
    const userAchievedKeys =
      await RedisService.getKeysByPattern(userAchievedPattern);

    const allSyncDataKeys: string[] = [];
    for (const cacheKey of userAchievedKeys) {
      const syncKeys = await RedisService.getSyncDataKeys(cacheKey);
      allSyncDataKeys.push(...syncKeys);
    }

    await RedisService.execPipeline((p) => {
      p.del(RedisService.buildKey(achievementsKey));
      for (const cacheKey of userAchievedKeys) {
        p.sRem(
          RedisService.buildKey("sync:pending"),
          RedisService.buildKey(cacheKey),
        );
        p.del(RedisService.buildKey(`read:lock:${cacheKey}`));
        p.del(RedisService.buildKey(`lock:${cacheKey}`));
        p.del(RedisService.buildKey(`sync:lock:${cacheKey}`));
        p.del(RedisService.buildKey(cacheKey));
      }
      for (const syncKey of allSyncDataKeys) {
        p.del(RedisService.buildKey(syncKey));
      }
    });
  }
}
