import { RedisContainer } from "@testcontainers/redis";
import type { StartedRedisContainer } from "@testcontainers/redis";
import { RedisService } from "../../services/redis-service";
import { CacheDbService } from "../../services/cache-db-service";
import { UserAchievement } from "../../types/classes/user-achievement";
import type { CachedUserAchievement } from "../../types/interfaces/achievement";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockAchievementsFromApi: CachedUserAchievement[] = [
  {
    id: "ach1",
    title: "First",
    description: "Desc",
    goal: 10,
    reward: 5,
    label: "label1",
    typeAchievement: { id: "t1", label: "points", data: "{}" },
    achieved: {
      achievementId: "ach1",
      userId: "user1",
      count: 3,
      finished: false,
      labelActive: true,
      acquiredDate: "2025-01-01T00:00:00Z",
    },
  },
  {
    id: "ach2",
    title: "Second",
    description: "Desc2",
    goal: 5,
    reward: 2,
    label: "label2",
    typeAchievement: { id: "t2", label: "points", data: "{}" },
    achieved: null,
  },
];

describe("CacheDbService (Testcontainers Redis)", () => {
  let container: StartedRedisContainer;

  beforeAll(async () => {
    container = await new RedisContainer("redis:7-alpine").start();
    process.env.REDIS_URL = container.getConnectionUrl();
    await RedisService.connect();
  }, 30_000);

  afterAll(async () => {
    await RedisService.disconnect();
    await container.stop();
  });

  describe("getAchievements", () => {
    it("returns achievements from DB and caches them when cache miss", async () => {
      const DbService = await import("../../services/db-service");
      jest.spyOn(DbService.DbService, "getUserAchievements").mockResolvedValueOnce(mockAchievementsFromApi);

      const result = await CacheDbService.getAchievements("ch1", "user1", "points");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("ach1");
      expect(result[0].channelId).toBe("ch1");
      expect(DbService.DbService.getUserAchievements).toHaveBeenCalledWith("user1", "ch1");

      const fromCache = await CacheDbService.getAchievements("ch1", "user1", "points");
      expect(fromCache).toHaveLength(2);
      expect(DbService.DbService.getUserAchievements).toHaveBeenCalledTimes(1);
    });

    it("filters by typeAchievement label", async () => {
      const DbService = await import("../../services/db-service");
      jest.spyOn(DbService.DbService, "getUserAchievements").mockResolvedValueOnce(mockAchievementsFromApi);

      const result = await CacheDbService.getAchievements("ch2", "user1", "other_label");
      expect(result).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates cache and adds to sync set", async () => {
      const DbService = await import("../../services/db-service");
      jest.spyOn(DbService.DbService, "getUserAchievements").mockResolvedValue(mockAchievementsFromApi);

      await CacheDbService.getAchievements("ch3", "user1", "points");
      const list = await CacheDbService.getAchievements("ch3", "user1", "points");
      const toUpdate = list[0];
      const updated = new UserAchievement(
        toUpdate.id,
        toUpdate.title,
        toUpdate.description,
        toUpdate.goal,
        toUpdate.reward,
        toUpdate.label,
        toUpdate.typeAchievement,
        {
          ...toUpdate.achieved!,
          count: 10,
          finished: true,
        },
        "ch3"
      );

      await CacheDbService.update(updated);

      const keys = await RedisService.getPendingSyncKeys();
      expect(keys).toContain("user_achieved:user1:ch3");
      const afterUpdate = await CacheDbService.getAchievements("ch3", "user1", "points");
      expect(afterUpdate[0].achieved?.count).toBe(10);
      expect(afterUpdate[0].achieved?.finished).toBe(true);
    });

    it("throws when achieved is missing", async () => {
      const invalid = new UserAchievement(
        "id",
        "t",
        "d",
        1,
        1,
        "l",
        null,
        null,
        "ch"
      );
      await expect(CacheDbService.update(invalid)).rejects.toThrow(
        "UserAchievement.achieved is required for update"
      );
    });
  });

  describe("refreshExpiredCacheEntries", () => {
    it("skips when cache key still has ttl", async () => {
      const DbService = await import("../../services/db-service");
      jest.spyOn(DbService.DbService, "getUserAchievements").mockResolvedValue(mockAchievementsFromApi);
      jest.spyOn(DbService.DbService, "putAchieved").mockResolvedValue();

      await CacheDbService.getAchievements("ch4", "user1", "points");
      const toUpdate = (await CacheDbService.getAchievements("ch4", "user1", "points"))[0];
      const updated = new UserAchievement(
        toUpdate.id,
        toUpdate.title,
        toUpdate.description,
        toUpdate.goal,
        toUpdate.reward,
        toUpdate.label,
        toUpdate.typeAchievement,
        { ...toUpdate.achieved!, count: 1 },
        "ch4"
      );
      await CacheDbService.update(updated);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(DbService.DbService.putAchieved).not.toHaveBeenCalled();
    });
  });
});
