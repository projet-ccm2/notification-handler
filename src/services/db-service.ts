import { config } from "../config/environment";
import { RedisService } from "./redis-service";
import { logger } from "../utils/logger";
import {
  Achievement,
  UserAchievement,
  UpdateUserAchievementRequest,
} from "../types";

export class DbService {
  private static readonly CACHE_PREFIX_ACHIEVEMENTS = "achievements:";
  private static readonly CACHE_PREFIX_USER_ACHIEVEMENTS = "user_achievements:";
  private static readonly CACHE_TTL = config.cache.ttl;

  static async getAchievements(channelId: string): Promise<Achievement[]> {
    const cacheKey = `${this.CACHE_PREFIX_ACHIEVEMENTS}${channelId}`;

    try {
      const cached = await RedisService.get<Achievement[]>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const response = await fetch(
        `${config.dbGateway.baseUrl}/achievements/${channelId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch achievements: ${response.status} ${response.statusText}`
        );
      }

      const achievements: Achievement[] = await response.json();

      await RedisService.set(cacheKey, achievements, this.CACHE_TTL);

      return achievements;
    } catch (error) {
      logger.error("Error getting achievements", {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async getUserAchievements(
    userId: string,
    channelId: string
  ): Promise<UserAchievement[]> {
    const cacheKey = `${this.CACHE_PREFIX_USER_ACHIEVEMENTS}${userId}:${channelId}`;

    try {
      const cached = await RedisService.get<UserAchievement[]>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const response = await fetch(
        `${config.dbGateway.baseUrl}/achievements/user/${userId}/channel/${channelId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch user achievements: ${response.status} ${response.statusText}`
        );
      }

      const userAchievements: UserAchievement[] = await response.json();

      await RedisService.set(cacheKey, userAchievements, this.CACHE_TTL);

      return userAchievements;
    } catch (error) {
      logger.error("Error getting user achievements", {
        userId,
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async updateUserAchievement(
    userId: string,
    achievementId: string,
    data: UpdateUserAchievementRequest
  ): Promise<void> {
    try {
      const response = await fetch(
        `${config.dbGateway.baseUrl}/users/${userId}/achievements/${achievementId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to update user achievement: ${response.status} ${response.statusText}`
        );
      }

      const cachePattern = `${this.CACHE_PREFIX_USER_ACHIEVEMENTS}${userId}:*`;
      await this.invalidateUserAchievementsCache(userId);

      logger.info("User achievement updated", {
        userId,
        achievementId,
      });
    } catch (error) {
      logger.error("Error updating user achievement", {
        userId,
        achievementId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private static async invalidateUserAchievementsCache(
    userId: string
  ): Promise<void> {
    //TODO: Implement cache invalidation for user achievements pattern
    // Redis doesn't support pattern deletion directly, need to scan and delete
    // For now, we'll let the cache expire naturally
  }

  static async refreshExpiredCacheEntries(): Promise<void> {
    //TODO: Implement background job to refresh expired cache entries
    // This should be called periodically to update cache entries when TTL expires
    // Need to track which entries need refreshing and update them one by one
  }
}
