import { RedisService } from "../../../services/redis-service";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

let errorCallback: ((err: { message: string }) => void) | null = null;
const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  sAdd: jest.fn(),
  sRem: jest.fn(),
  sMembers: jest.fn(),
  eval: jest.fn(),
  keys: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn((ev: string, cb: (arg?: unknown) => void) => {
    if (ev === "ready") cb();
    if (ev === "error")
      errorCallback = cb as (err: { message: string }) => void;
  }),
  scanIterator: jest.fn(),
};

jest.mock("redis", () => ({
  createClient: () => mockClient,
}));

describe("RedisService", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    await RedisService.connect();
  });

  afterAll(async () => {
    await RedisService.disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("get returns parsed JSON when value exists", async () => {
    mockClient.get.mockResolvedValue(JSON.stringify({ foo: "bar" }));
    const result = await RedisService.get<{ foo: string }>("key1");
    expect(result).toEqual({ foo: "bar" });
  });

  it("get returns null when value missing", async () => {
    mockClient.get.mockResolvedValue(null);
    const result = await RedisService.get("key2");
    expect(result).toBeNull();
  });

  it("getSyncData returns parsed sync data when key exists", async () => {
    const data = { userId: "u1", achievementId: "a1", data: { count: 1 } };
    mockClient.get.mockResolvedValue(JSON.stringify(data));
    const result = await RedisService.getSyncData("user_achieved:u1:ch1", "a1");
    expect(result).toEqual(data);
  });

  it("getSyncData returns null when key missing", async () => {
    mockClient.get.mockResolvedValue(null);
    const result = await RedisService.getSyncData("user_achieved:u1:ch1", "a1");
    expect(result).toBeNull();
  });

  it("set uses setEx when ttl provided", async () => {
    mockClient.setEx.mockResolvedValue("OK");
    await RedisService.set("k", { x: 1 }, 60);
    expect(mockClient.setEx).toHaveBeenCalledWith("test:k", 60, expect.any(String));
    expect(mockClient.set).not.toHaveBeenCalled();
  });

  it("set uses set when ttl not provided", async () => {
    mockClient.set.mockResolvedValue("OK");
    await RedisService.set("k", "v");
    expect(mockClient.set).toHaveBeenCalledWith("test:k", expect.any(String));
    expect(mockClient.setEx).not.toHaveBeenCalled();
  });

  it("acquireLock returns token when lock acquired", async () => {
    mockClient.set.mockResolvedValue("OK");
    const result = await RedisService.acquireLock("lock:1", 15);
    expect(typeof result).toBe("string");
    expect(result).not.toBe(false);
    expect(mockClient.set).toHaveBeenCalledWith("test:lock:1", result, {
      NX: true,
      EX: 15,
    });
  });

  it("acquireLock returns false when key already set", async () => {
    mockClient.set.mockResolvedValue(null);
    const result = await RedisService.acquireLock("lock:2", 10);
    expect(result).toBe(false);
  });

  it("releaseLock calls eval with script, keys and token", async () => {
    mockClient.eval.mockResolvedValue(1);
    await RedisService.releaseLock("lock:3", "my-token");
    expect(mockClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      { keys: ["test:lock:3"], arguments: ["my-token"] },
    );
  });

  it("getTtl returns ttl from client", async () => {
    mockClient.ttl.mockResolvedValue(42);
    const result = await RedisService.getTtl("key");
    expect(result).toBe(42);
    expect(mockClient.ttl).toHaveBeenCalledWith("test:key");
  });

  it("deleteAllSyncDataForCacheKey calls del when keys found", async () => {
    async function* keyGen() {
      yield "test:sync:data:ck:a1";
    }
    mockClient.scanIterator.mockReturnValue(keyGen());
    mockClient.del.mockResolvedValue(1);
    await RedisService.deleteAllSyncDataForCacheKey("ck");
    expect(mockClient.del).toHaveBeenCalledWith(["test:sync:data:ck:a1"]);
  });

  it("deleteAllSyncDataForCacheKey does not call del when no keys", async () => {
    async function* emptyKeyGen() {
      /* no keys */
    }
    mockClient.scanIterator.mockReturnValue(emptyKeyGen());
    await RedisService.deleteAllSyncDataForCacheKey("ck");
    expect(mockClient.del).not.toHaveBeenCalled();
  });

  it("invokes error callback when Redis client emits error", async () => {
    const { logger } = require("../../../utils/logger");
    errorCallback?.({ message: "Connection refused" });
    expect(logger.error).toHaveBeenCalledWith("Redis client error", {
      error: "Connection refused",
    });
  });
});
