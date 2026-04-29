import { CacheDbService } from "../../../services/cache-db-service";
import { RedisService } from "../../../services/redis-service";
import { UserAchievement } from "../../../types/classes/user-achievement";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../../services/redis-service");
jest.mock("../../../services/db-service", () => ({
  DbService: {
    getUserAchievements: jest.fn(),
    getAchievements: jest.fn(),
    saveAchieved: jest.fn(),
    getUser: jest.fn(),
    addExpToUser: jest.fn(),
    getChannelBadge: jest.fn(),
    getPossesses: jest.fn(),
    postPossesses: jest.fn(),
  },
}));

jest.mock("../../../services/badge-service", () => ({
  BadgeService: {
    tryGrantBadge: jest.fn(),
  },
}));

const Redis = RedisService as jest.Mocked<typeof RedisService>;
const { DbService } = require("../../../services/db-service");
const { BadgeService } = require("../../../services/badge-service");

describe("CacheDbService branches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Redis.buildKey.mockImplementation((k: string) => `test:${k}`);
    Redis.execPipeline.mockResolvedValue(undefined);
    Redis.getSyncDataKeys.mockResolvedValue([]);
  });

  describe("getAchievements", () => {
    it("returns from cache on retry when lock not acquired", async () => {
      const defs = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 10,
          reward: 5,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      const achieved = [
        {
          achievementId: "a1",
          userId: "u1",
          count: 1,
          finished: false,
          labelActive: true,
          acquiredDate: "2025-01-01",
        },
      ];
      Redis.mGet
        .mockResolvedValueOnce([null, null])
        .mockResolvedValueOnce([
          JSON.stringify(defs),
          JSON.stringify(achieved),
        ]);
      Redis.acquireLock.mockResolvedValue(false);

      const result = await CacheDbService.getAchievements(
        "ch1",
        "u1",
        "points",
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a1");
      expect(DbService.getUserAchievements).not.toHaveBeenCalled();
    });

    it("returns from cache when defsAgain and achievedAgain present inside try", async () => {
      const defs = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 10,
          reward: 5,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      const achieved = [
        {
          achievementId: "a1",
          userId: "u1",
          count: 1,
          finished: false,
          labelActive: true,
          acquiredDate: "2025-01-01",
        },
      ];
      Redis.mGet
        .mockResolvedValueOnce([null, null])
        .mockResolvedValueOnce([
          JSON.stringify(defs),
          JSON.stringify(achieved),
        ]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const result = await CacheDbService.getAchievements(
        "ch2",
        "u1",
        "points",
      );

      expect(result).toHaveLength(1);
      expect(DbService.getUserAchievements).not.toHaveBeenCalled();
    });

    it("returns [] when lock not acquired and final cache read misses", async () => {
      Redis.mGet.mockResolvedValue([null, null]);
      Redis.acquireLock.mockResolvedValue(false);

      const result = await CacheDbService.getAchievements(
        "ch1",
        "u1",
        "points",
      );

      expect(result).toEqual([]);
      expect(DbService.getUserAchievements).not.toHaveBeenCalled();
    });

    it("returns from final cache read when lock not acquired but cache filled by another", async () => {
      const defs = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 10,
          reward: 5,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      const achieved = [
        {
          achievementId: "a1",
          userId: "u1",
          count: 1,
          finished: false,
          labelActive: true,
          acquiredDate: "2025-01-01",
        },
      ];
      Redis.mGet
        .mockResolvedValueOnce([null, null])
        .mockResolvedValueOnce([null, null])
        .mockResolvedValueOnce([
          JSON.stringify(defs),
          JSON.stringify(achieved),
        ]);
      Redis.acquireLock.mockResolvedValue(false);

      const result = await CacheDbService.getAchievements(
        "ch1",
        "u1",
        "points",
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a1");
      expect(DbService.getUserAchievements).not.toHaveBeenCalled();
    });

    it("fetches definitions via getAchievements when getUserAchievements returns empty", async () => {
      const channelDefs = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 10,
          reward: 5,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      Redis.mGet
        .mockResolvedValueOnce([null, null])
        .mockResolvedValueOnce([null, null]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);
      Redis.set.mockResolvedValue(undefined);
      DbService.getUserAchievements.mockResolvedValue([]);
      (DbService.getAchievements as jest.Mock).mockResolvedValue(channelDefs);

      const result = await CacheDbService.getAchievements(
        "ch1",
        "u1",
        "points",
      );

      expect(DbService.getUserAchievements).toHaveBeenCalledWith("u1", "ch1");
      expect(DbService.getAchievements).toHaveBeenCalledWith("ch1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a1");
      expect(result[0].achieved.count).toBe(0);
    });
  });

  describe("refreshExpiredCacheEntries", () => {
    it("removes from sync set when syncDataList is empty", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u1:ch1"]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.getTtl.mockResolvedValue(-1);
      Redis.getAllSyncDataForCacheKey.mockResolvedValue([]);
      Redis.removeFromSyncSet.mockResolvedValue(undefined);
      Redis.releaseLock.mockResolvedValue(undefined);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(Redis.removeFromSyncSet).toHaveBeenCalledWith(
        "user_achieved:u1:ch1",
      );
      expect(DbService.saveAchieved).not.toHaveBeenCalled();
    });

    it("calls saveAchieved and cleans up when cache expired and sync data exists", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u2:ch2"]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.getTtl.mockResolvedValue(0);
      Redis.getAllSyncDataForCacheKey.mockResolvedValue([
        {
          userId: "u2",
          achievementId: "a2",
          data: {
            count: 5,
            finished: true,
            labelActive: false,
            acquiredDate: "2025-01-01",
          },
        },
      ]);
      Redis.getSyncDataKeys.mockResolvedValue([
        "sync:data:user_achieved:u2:ch2:a2",
      ]);
      Redis.releaseLock.mockResolvedValue(undefined);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(DbService.addExpToUser).not.toHaveBeenCalled();
      expect(DbService.saveAchieved).toHaveBeenCalledWith(
        expect.objectContaining({
          achievementId: "a2",
          userId: "u2",
          count: 5,
          finished: true,
        }),
      );
      expect(Redis.execPipeline).toHaveBeenCalled();
    });

    it("calls addExpToUser when rewardToAdd is present in sync data", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u3:ch3"]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.getTtl.mockResolvedValue(-1);
      Redis.getAllSyncDataForCacheKey.mockResolvedValue([
        {
          userId: "u3",
          achievementId: "a3",
          data: {
            count: 10,
            finished: true,
            labelActive: false,
            acquiredDate: "2025-01-15",
            rewardToAdd: 100,
          },
        },
      ]);
      Redis.getSyncDataKeys.mockResolvedValue([
        "sync:data:user_achieved:u3:ch3:a3",
      ]);
      Redis.releaseLock.mockResolvedValue(undefined);
      DbService.addExpToUser.mockResolvedValue(undefined);
      DbService.saveAchieved.mockResolvedValue(undefined);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(DbService.addExpToUser).toHaveBeenCalledWith("u3", 100);
      expect(DbService.saveAchieved).toHaveBeenCalledWith(
        expect.objectContaining({
          achievementId: "a3",
          userId: "u3",
          count: 10,
          finished: true,
        }),
      );
    });

    it("skips when lock not acquired", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u3:ch3"]);
      Redis.acquireLock.mockResolvedValue(false);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(Redis.getTtl).not.toHaveBeenCalled();
      expect(DbService.saveAchieved).not.toHaveBeenCalled();
    });

    it("continues when ttl > 0", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u4:ch4"]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.getTtl.mockResolvedValue(100);
      Redis.releaseLock.mockResolvedValue(undefined);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(Redis.getAllSyncDataForCacheKey).not.toHaveBeenCalled();
      expect(DbService.saveAchieved).not.toHaveBeenCalled();
    });

    it("cleans up via pipeline after sync", async () => {
      Redis.getPendingSyncKeys.mockResolvedValue(["user_achieved:u5:ch5"]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.getTtl.mockResolvedValue(-1);
      Redis.getAllSyncDataForCacheKey.mockResolvedValue([
        {
          userId: "u5",
          achievementId: "a5",
          data: {
            count: 1,
            finished: false,
            labelActive: false,
            acquiredDate: "",
          },
        },
      ]);
      Redis.getSyncDataKeys.mockResolvedValue([
        "sync:data:user_achieved:u5:ch5:a5",
      ]);
      Redis.releaseLock.mockResolvedValue(undefined);

      await CacheDbService.refreshExpiredCacheEntries();

      expect(Redis.execPipeline).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("throws when achieved has no userId", async () => {
      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        1,
        1,
        "L",
        { id: "t1", label: "points", data: "{}" },
        {
          achievementId: "a1",
          userId: "",
          count: 0,
          finished: false,
          labelActive: false,
          acquiredDate: "",
        },
        "ch1",
      );

      await expect(CacheDbService.update(u)).rejects.toThrow(
        "UserAchievement.achieved is required for update",
      );
      expect(Redis.acquireLock).not.toHaveBeenCalled();
    });

    it("throws when lock not acquired after 10 attempts", async () => {
      Redis.acquireLock.mockResolvedValue(false);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        1,
        1,
        "L",
        { id: "t1", label: "points", data: "{}" },
        {
          achievementId: "a1",
          userId: "u1",
          count: 0,
          finished: false,
          labelActive: false,
          acquiredDate: "",
        },
        "ch1",
      );

      await expect(CacheDbService.update(u)).rejects.toThrow(
        "Failed to acquire lock",
      );
      expect(Redis.acquireLock).toHaveBeenCalledTimes(10);
    });

    it("calls getAchievements when achievedList is null then updates", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 1,
        finished: false,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      Redis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([achievedItem]);
      Redis.mGet.mockResolvedValue([null, null]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.set.mockResolvedValue(undefined);
      Redis.releaseLock.mockResolvedValue(undefined);
      DbService.getUserAchievements.mockResolvedValue([
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 1,
          reward: 1,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
          achieved: achievedItem,
        },
      ]);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        1,
        1,
        "L",
        { id: "t1", label: "points", data: "{}" },
        achievedItem,
        "ch1",
      );

      await CacheDbService.update(u);

      expect(DbService.getUserAchievements).toHaveBeenCalledWith("u1", "ch1");
      expect(Redis.execPipeline).toHaveBeenCalled();
    });

    it("stores rewardToAdd in syncData when finished transitions from false to true", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 4,
        finished: false,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      Redis.get.mockResolvedValue([achievedItem]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        { ...achievedItem, count: 5, finished: true },
        "ch1",
      );

      await CacheDbService.update(u);

      expect(Redis.execPipeline).toHaveBeenCalled();
      const pipelineCallback = Redis.execPipeline.mock.calls[0][0];
      const mockPipeline = {
        setEx: jest.fn(),
        sAdd: jest.fn(),
        set: jest.fn(),
      };
      pipelineCallback(mockPipeline as any);
      const syncDataArg = mockPipeline.set.mock.calls[0][1];
      const syncData = JSON.parse(syncDataArg);
      expect(syncData.data.rewardToAdd).toBe(50);
      expect(syncData.data.count).toBe(5);
      expect(syncData.data.finished).toBe(true);
    });

    it("calls tryGrantBadge when isNewCompletion and all achievements finished", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 4,
        finished: false,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      const definitions = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 5,
          reward: 50,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      Redis.get
        .mockResolvedValueOnce([achievedItem])
        .mockResolvedValueOnce(definitions);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);
      BadgeService.tryGrantBadge.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        { ...achievedItem, count: 5, finished: true },
        "ch1",
      );

      await CacheDbService.update(u);

      expect(BadgeService.tryGrantBadge).toHaveBeenCalledWith("u1", "ch1");
    });

    it("calls DbService.getAchievements when definitions cache is null and isNewCompletion", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 4,
        finished: false,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      const definitions = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 5,
          reward: 50,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
      ];
      Redis.get
        .mockResolvedValueOnce([achievedItem])
        .mockResolvedValueOnce(null);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);
      (DbService.getAchievements as jest.Mock).mockResolvedValue(definitions);
      BadgeService.tryGrantBadge.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        { ...achievedItem, count: 5, finished: true },
        "ch1",
      );

      await CacheDbService.update(u);

      expect(DbService.getAchievements).toHaveBeenCalledWith("ch1");
      expect(BadgeService.tryGrantBadge).toHaveBeenCalledWith("u1", "ch1");
    });

    it("does not call tryGrantBadge when isNewCompletion but not all achievements finished", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 4,
        finished: false,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      const definitions = [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 5,
          reward: 50,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
        },
        {
          id: "a2",
          title: "T2",
          description: "D2",
          goal: 10,
          reward: 100,
          label: "L2",
          typeAchievement: { id: "t2", label: "points", data: "{}" },
        },
      ];
      const achievedList = [
        achievedItem,
        {
          achievementId: "a2",
          userId: "u1",
          count: 2,
          finished: false,
          labelActive: false,
          acquiredDate: "2025-01-01",
        },
      ];
      Redis.get
        .mockResolvedValueOnce(achievedList)
        .mockResolvedValueOnce(definitions);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        { ...achievedItem, count: 5, finished: true },
        "ch1",
      );

      await CacheDbService.update(u);

      expect(BadgeService.tryGrantBadge).not.toHaveBeenCalled();
    });

    it("does not store rewardToAdd when finished was already true", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 5,
        finished: true,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      Redis.get.mockResolvedValue([achievedItem]);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        achievedItem,
        "ch1",
      );

      await CacheDbService.update(u);

      expect(Redis.execPipeline).toHaveBeenCalled();
      const pipelineCallback = Redis.execPipeline.mock.calls[0][0];
      const mockPipeline = {
        setEx: jest.fn(),
        sAdd: jest.fn(),
        set: jest.fn(),
      };
      pipelineCallback(mockPipeline as any);
      const syncDataArg = mockPipeline.set.mock.calls[0][1];
      const syncData = JSON.parse(syncDataArg);
      expect(syncData.data).not.toHaveProperty("rewardToAdd");
    });

    it("stores rewardToAdd when achievement not yet in cache list (idx=-1, first completion)", async () => {
      Redis.get.mockResolvedValue([]);
      Redis.getSyncData.mockResolvedValue(null);
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        1,
        75,
        "L",
        { id: "t1", label: "points", data: "{}" },
        {
          achievementId: "a1",
          userId: "u1",
          count: 1,
          finished: true,
          labelActive: false,
          acquiredDate: "",
        },
        "ch1",
      );

      await CacheDbService.update(u);

      const pipelineCallback = Redis.execPipeline.mock.calls[0][0];
      const mockPipeline = {
        setEx: jest.fn(),
        sAdd: jest.fn(),
        set: jest.fn(),
      };
      pipelineCallback(mockPipeline as any);
      const syncData = JSON.parse(mockPipeline.set.mock.calls[0][1]);
      expect(syncData.data.rewardToAdd).toBe(75);
    });

    it("preserves rewardToAdd on second update when syncData already contains it", async () => {
      const achievedItem = {
        achievementId: "a1",
        userId: "u1",
        count: 5,
        finished: true,
        labelActive: false,
        acquiredDate: "2025-01-01",
      };
      Redis.get.mockResolvedValue([achievedItem]);
      Redis.getSyncData.mockResolvedValue({
        userId: "u1",
        achievementId: "a1",
        data: {
          count: 5,
          finished: true,
          labelActive: false,
          acquiredDate: "2025-01-01",
          rewardToAdd: 50,
        },
      });
      Redis.acquireLock.mockResolvedValue("token");
      Redis.releaseLock.mockResolvedValue(undefined);

      const u = new UserAchievement(
        "a1",
        "T",
        "D",
        5,
        50,
        "L",
        { id: "t1", label: "points", data: "{}" },
        { ...achievedItem, labelActive: true },
        "ch1",
      );

      await CacheDbService.update(u);

      const pipelineCallback = Redis.execPipeline.mock.calls[0][0];
      const mockPipeline = {
        setEx: jest.fn(),
        sAdd: jest.fn(),
        set: jest.fn(),
      };
      pipelineCallback(mockPipeline as any);
      const syncData = JSON.parse(mockPipeline.set.mock.calls[0][1]);
      expect(syncData.data.rewardToAdd).toBe(50);
    });
  });

  describe("clearCacheByChannelId", () => {
    it("deletes achievements key and all user achieved keys for channel via pipeline", async () => {
      Redis.getKeysByPattern.mockResolvedValue([
        "user_achieved:u1:ch1",
        "user_achieved:u2:ch1",
      ]);
      Redis.getSyncDataKeys.mockResolvedValue([]);

      await CacheDbService.clearCacheByChannelId("ch1");

      expect(Redis.getKeysByPattern).toHaveBeenCalledWith(
        "user_achieved:*:ch1",
      );
      expect(Redis.execPipeline).toHaveBeenCalled();
    });

    it("only deletes achievements key when no user achieved keys", async () => {
      Redis.getKeysByPattern.mockResolvedValue([]);

      await CacheDbService.clearCacheByChannelId("ch2");

      expect(Redis.execPipeline).toHaveBeenCalled();
    });
  });
});
