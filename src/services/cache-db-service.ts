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

export type EventCtx = { channelLogin?: string; userLogin?: string };

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
    const filtered = merged.filter(
      (u) => u.typeAchievement.label === typeAchievementLabel,
    );
    logger.info("mergeAndFilter result", {
      channelId,
      userId,
      typeAchievementLabel,
      definitionsCount: definitions.length,
      defsWithTypeCount: defsWithType.length,
      defsTypeLabels: defsWithType.map((d) => d.typeAchievement.label),
      defsLabels: defsWithType.map((d) => d.label),
      achievedCount: achievedList.length,
      mergedCount: merged.length,
      filteredCount: filtered.length,
      definitions,
      achievedList,
      merged,
      filtered,
      context: "cache-db",
    });
    return filtered;
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

  private static async loadFromDb(
    channelId: string,
    userId: string,
  ): Promise<{ definitions: AchievementWithType[]; achievedList: Achieved[] }> {
    const apiResponse = await DbService.getUserAchievements(userId, channelId);
    const itemsWithType = apiResponse.filter(
      (item) => item.typeAchievement != null,
    );
    if (itemsWithType.length === 0) {
      return {
        definitions: await DbService.getAchievements(channelId),
        achievedList: [],
      };
    }
    return {
      definitions: itemsWithType.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        goal: item.goal,
        reward: item.reward,
        label: item.label,
        typeAchievement: item.typeAchievement,
      })),
      achievedList: itemsWithType.map(
        (item) =>
          item.achieved ?? UserAchievement.defaultAchieved(item.id, userId),
      ),
    };
  }

  private static async fetchFromDb(
    channelId: string,
    userId: string,
    typeAchievement: string,
  ): Promise<UserAchievement[]> {
    const { definitions, achievedList } = await this.loadFromDb(
      channelId,
      userId,
    );
    return this.mergeAndFilter(
      definitions,
      achievedList,
      channelId,
      typeAchievement,
      userId,
    );
  }

  private static async fetchAndPopulateCache(
    cacheKeyAchievements: string,
    cacheKeyUser: string,
    channelId: string,
    typeAchievement: string,
    userId: string,
  ): Promise<UserAchievement[]> {
    const cached = await this.tryGetFromCache(
      cacheKeyAchievements,
      cacheKeyUser,
      channelId,
      typeAchievement,
      userId,
    );
    if (cached) return cached;

    const { definitions, achievedList } = await this.loadFromDb(
      channelId,
      userId,
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
  }

  static async getAchievements(
    channelId: string,
    userId: string,
    typeAchievement: string,
  ): Promise<UserAchievement[]> {
    if (!RedisService.isAvailable()) {
      return this.fetchFromDb(channelId, userId, typeAchievement);
    }

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
      return (
        (await this.tryGetFromCache(
          cacheKeyAchievements,
          cacheKeyUser,
          channelId,
          typeAchievement,
          userId,
        )) ?? []
      );
    }

    try {
      return await this.fetchAndPopulateCache(
        cacheKeyAchievements,
        cacheKeyUser,
        channelId,
        typeAchievement,
        userId,
      );
    } finally {
      await RedisService.releaseLock(lockKey, lockToken);
    }
  }

  private static async tryGrantBadgeIfNewCompletion(
    userId: string,
    channelId: string,
    newList: Achieved[],
    ctx: EventCtx,
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

  private static async updateDirectToDb(
    userAchievement: UserAchievement,
    ctx: EventCtx,
  ): Promise<void> {
    if (!userAchievement.achieved)
      throw new Error("UserAchievement.achieved is required for update");
    const userId = userAchievement.achieved.userId;
    if (!userId)
      throw new Error("UserAchievement.achieved.userId is required for update");
    const channelId = userAchievement.channelId;

    const updated = userAchievement.toCacheAchieved();
    if (updated.finished && !updated.acquiredDate) {
      updated.acquiredDate = new Date().toISOString();
    }

    const allAchieved = await DbService.getUserAchievements(userId, channelId);
    const existingItem = allAchieved.find(
      (item) => item.id === userAchievement.id,
    );
    const wasFinished = existingItem?.achieved?.finished === true;
    const isNewCompletion = !wasFinished && updated.finished;

    await DbService.saveAchieved({
      achievementId: userAchievement.id,
      userId,
      count: updated.count,
      finished: updated.finished,
      labelActive: updated.labelActive,
      acquiredDate: updated.acquiredDate,
    });

    if (isNewCompletion) {
      if (userAchievement.reward != null) {
        await DbService.addExpToUser(userId, userAchievement.reward);
      }

      const newList: Achieved[] = allAchieved
        .filter((item) => item.achieved != null)
        .map((item) => item.achieved!);
      const idx = newList.findIndex(
        (a) => a.achievementId === userAchievement.id,
      );
      if (idx >= 0) newList[idx] = updated;
      else newList.push(updated);

      const userLogin = ctx.userLogin ?? "Un utilisateur";
      logger.info(
        "Achievement newly completed (no-cache mode), sending notifications",
        {
          userId,
          channelId,
          achievementId: userAchievement.id,
          achievementTitle: userAchievement.title,
          userLogin,
          channelLogin: ctx.channelLogin,
          context: "achievement",
        },
      );
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
  }

  private static async performCachedUpdate(
    cacheKey: string,
    userAchievement: UserAchievement,
    userId: string,
    channelId: string,
    ctx: EventCtx,
  ): Promise<void> {
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
    const preservedReward = (existingSyncData?.data as SyncDataForAchievement)
      ?.rewardToAdd;
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
        context: "achievement",
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
  }

  static async update(
    userAchievement: UserAchievement,
    ctx: EventCtx = {},
  ): Promise<void> {
    if (!RedisService.isAvailable()) {
      return this.updateDirectToDb(userAchievement, ctx);
    }

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
        await this.performCachedUpdate(
          cacheKey,
          userAchievement,
          userId,
          channelId,
          ctx,
        );
        return;
      } finally {
        await RedisService.releaseLock(lockKey, lockToken);
      }
    }

    throw new Error(
      `Failed to acquire lock for cacheKey: ${cacheKey} after 10 attempts`,
    );
  }

  private static readonly FLUSH_BACKOFF_PREFIX = "flush:backoff:";
  private static readonly FLUSH_FAILURES_PREFIX = "flush:failures:";
  private static readonly FLUSH_BACKOFF_BASE_SECONDS = 30;
  private static readonly FLUSH_BACKOFF_MAX_SECONDS = 600;

  private static async flushCacheKey(
    cacheKey: string,
    force: boolean,
  ): Promise<void> {
    const lockKey = `sync:lock:${cacheKey}`;
    const lockToken = await RedisService.acquireLock(lockKey, 30);
    if (!lockToken) return;

    try {
      const ttl = await RedisService.getTtl(cacheKey);
      if (!force && ttl > 0) return;

      logger.debug("Cache TTL expired, starting flush to DB", {
        cacheKey,
        ttl,
        context: "cache-sync",
      });

      const syncDataList =
        await RedisService.getAllSyncDataForCacheKey(cacheKey);

      if (syncDataList.length === 0) {
        logger.debug("No sync data to flush, removing from sync set", {
          cacheKey,
          context: "cache-sync",
        });
        await RedisService.removeFromSyncSet(cacheKey);
        return;
      }

      for (const syncData of syncDataList) {
        const data = syncData.data as SyncDataForAchievement;
        if (data.rewardToAdd != null) {
          logger.debug("Flushing exp to DB gateway", {
            userId: syncData.userId,
            rewardToAdd: data.rewardToAdd,
            context: "cache-sync",
          });
          await DbService.addExpToUser(syncData.userId, data.rewardToAdd);
        }
        logger.debug("Flushing achieved to DB gateway", {
          userId: syncData.userId,
          achievementId: syncData.achievementId,
          context: "cache-sync",
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
        context: "cache-sync",
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
      await RedisService.delete(`${this.FLUSH_FAILURES_PREFIX}${cacheKey}`);
    } catch (error) {
      const failuresKey = `${this.FLUSH_FAILURES_PREFIX}${cacheKey}`;
      const previous = (await RedisService.get<number>(failuresKey)) ?? 0;
      const failures = previous + 1;
      const backoffSeconds = Math.min(
        this.FLUSH_BACKOFF_BASE_SECONDS * 2 ** (failures - 1),
        this.FLUSH_BACKOFF_MAX_SECONDS,
      );
      await RedisService.set(
        failuresKey,
        failures,
        this.FLUSH_BACKOFF_MAX_SECONDS * 2,
      );
      await RedisService.set(
        `${this.FLUSH_BACKOFF_PREFIX}${cacheKey}`,
        1,
        backoffSeconds,
      );
      logger.error("Failed to flush cache key to DB", {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
        failures,
        backoffSeconds,
        context: "cache-sync",
      });
    } finally {
      await RedisService.releaseLock(lockKey, lockToken);
    }
  }

  static async refreshExpiredCacheEntries(force = false): Promise<void> {
    const pendingKeys = await RedisService.getPendingSyncKeys();

    for (const cacheKey of pendingKeys) {
      if (!force) {
        const backoffTtl = await RedisService.getTtl(
          `${this.FLUSH_BACKOFF_PREFIX}${cacheKey}`,
        );
        if (backoffTtl > 0) continue;
      }

      await this.flushCacheKey(cacheKey, force);
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
