import { RedisContainer } from "@testcontainers/redis";
import type { StartedRedisContainer } from "@testcontainers/redis";
import { RedisService } from "../../services/redis-service";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("RedisService (Testcontainers)", () => {
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

  beforeEach(async () => {
    const keys = await RedisService.getPendingSyncKeys();
    for (const key of keys) {
      await RedisService.removeFromSyncSet(key);
    }
  });

  it("set and get value", async () => {
    await RedisService.set("test:key1", { foo: "bar" }, 60);
    const value = await RedisService.get<{ foo: string }>("test:key1");
    expect(value).toEqual({ foo: "bar" });
  });

  it("get returns null for missing key", async () => {
    const value = await RedisService.get("test:missing");
    expect(value).toBeNull();
  });

  it("delete removes key", async () => {
    await RedisService.set("test:del", "x");
    await RedisService.delete("test:del");
    expect(await RedisService.get("test:del")).toBeNull();
  });

  it("exists returns true when key present", async () => {
    await RedisService.set("test:exists", 1);
    expect(await RedisService.exists("test:exists")).toBe(true);
    await RedisService.delete("test:exists");
    expect(await RedisService.exists("test:exists")).toBe(false);
  });

  it("getTtl returns remaining ttl", async () => {
    await RedisService.set("test:ttl", 1, 300);
    const ttl = await RedisService.getTtl("test:ttl");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
    await RedisService.delete("test:ttl");
  });

  it("addToSyncSet and getPendingSyncKeys", async () => {
    await RedisService.addToSyncSet("user_achieved:u1:ch1");
    const keys = await RedisService.getPendingSyncKeys();
    expect(keys).toContain("user_achieved:u1:ch1");
    await RedisService.removeFromSyncSet("user_achieved:u1:ch1");
    expect(await RedisService.getPendingSyncKeys()).not.toContain("user_achieved:u1:ch1");
  });

  it("storeSyncData and getAllSyncDataForCacheKey", async () => {
    const cacheKey = "user_achieved:u2:ch2";
    await RedisService.storeSyncData(cacheKey, {
      userId: "u2",
      achievementId: "ach1",
      data: { count: 5, finished: false },
    });
    const list = await RedisService.getAllSyncDataForCacheKey(cacheKey);
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe("u2");
    expect(list[0].achievementId).toBe("ach1");
    await RedisService.deleteAllSyncDataForCacheKey(cacheKey);
  });

  it("acquireLock and releaseLock", async () => {
    const lockKey = "lock:test:lock1";
    const acquired1 = await RedisService.acquireLock(lockKey, 10);
    expect(acquired1).toBe(true);
    const acquired2 = await RedisService.acquireLock(lockKey, 10);
    expect(acquired2).toBe(false);
    await RedisService.releaseLock(lockKey);
    const acquired3 = await RedisService.acquireLock(lockKey, 10);
    expect(acquired3).toBe(true);
    await RedisService.releaseLock(lockKey);
  });
});
