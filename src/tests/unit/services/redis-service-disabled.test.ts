jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const limitErr = () => new Error("max requests limit exceeded");

const buildMockClient = (overrides: Record<string, jest.Mock> = {}) => ({
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  sAdd: jest.fn(),
  sRem: jest.fn(),
  sMembers: jest.fn(),
  mGet: jest.fn(),
  eval: jest.fn(),
  multi: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn((ev: string, cb: (arg?: unknown) => void) => {
    if (ev === "ready") cb();
  }),
  scanIterator: jest.fn(),
  ...overrides,
});

const loadFreshRedis = async (
  client: ReturnType<typeof buildMockClient>,
): Promise<typeof import("../../../services/redis-service").RedisService> => {
  let RedisService!: typeof import("../../../services/redis-service").RedisService;
  await jest.isolateModulesAsync(async () => {
    jest.doMock("redis", () => ({ createClient: () => client }));
    process.env.REDIS_URL = "redis://localhost:6379";
    RedisService = (await import("../../../services/redis-service"))
      .RedisService;
    await RedisService.connect();
  });
  return RedisService;
};

describe("RedisService disabled & error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("disables itself on max-requests error and returns defaults afterwards", async () => {
    const client = buildMockClient({
      get: jest.fn().mockRejectedValue(limitErr()),
    });
    const Redis = await loadFreshRedis(client);

    expect(await Redis.get("k")).toBeNull();
    expect(Redis.isAvailable()).toBe(false);

    expect(await Redis.get("k2")).toBeNull();
    expect(await Redis.mGet(["a", "b"])).toEqual([null, null]);
    expect(await Redis.getKeysByPattern("*")).toEqual([]);
    expect(await Redis.getTtl("k")).toBe(-1);
    expect(await Redis.getPendingSyncKeys()).toEqual([]);
    expect(await Redis.getSyncData("ck", "a1")).toBeNull();
    expect(await Redis.getAllSyncDataForCacheKey("ck")).toEqual([]);
    expect(await Redis.getSyncDataKeys("ck")).toEqual([]);
    expect(await Redis.acquireLock("lock", 10)).toBe(false);
    await Redis.set("k", "v");
    await Redis.delete("k");
    await Redis.removeFromSyncSet("k");
    await Redis.releaseLock("lock", "tok");
    await Redis.execPipeline(() => undefined);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.set).not.toHaveBeenCalled();
    expect(client.del).not.toHaveBeenCalled();
  });

  it("rethrows non-limit errors", async () => {
    const client = buildMockClient({
      get: jest.fn().mockRejectedValue(new Error("boom")),
    });
    const Redis = await loadFreshRedis(client);

    const result = await Redis.get("k").catch((e: Error) => e.message);
    expect(result).toBe("boom");
    expect(Redis.isAvailable()).toBe(true);
  });

  it("set/setEx swallows limit error and disables", async () => {
    const client = buildMockClient({
      setEx: jest.fn().mockRejectedValue(limitErr()),
    });
    const Redis = await loadFreshRedis(client);

    await Redis.set("k", { v: 1 }, 60);
    expect(Redis.isAvailable()).toBe(false);
  });

  it("execPipeline disables on limit error", async () => {
    const failingMulti = jest.fn(() => ({
      del: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      sRem: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setEx: jest.fn().mockReturnThis(),
      exec: jest.fn().mockRejectedValue(limitErr()),
    }));
    const client = buildMockClient({ multi: failingMulti });
    const Redis = await loadFreshRedis(client);

    await Redis.execPipeline((p) => {
      (p as unknown as { del: (k: string) => void }).del("k");
    });
    expect(Redis.isAvailable()).toBe(false);
  });

  it("scanKeys via getKeysByPattern: iterates and strips prefix", async () => {
    async function* gen() {
      yield "test:user_achieved:u1:ch1";
      yield "test:user_achieved:u2:ch1";
    }
    const client = buildMockClient({
      scanIterator: jest.fn(() => gen()),
    });
    const Redis = await loadFreshRedis(client);

    const keys = await Redis.getKeysByPattern("user_achieved:*");
    expect(keys).toEqual(["user_achieved:u1:ch1", "user_achieved:u2:ch1"]);
  });

  it("getAllSyncDataForCacheKey returns parsed values, filters null", async () => {
    async function* gen() {
      yield "test:sync:data:ck:a1";
    }
    const client = buildMockClient({
      scanIterator: jest.fn(() => gen()),
      mGet: jest
        .fn()
        .mockResolvedValue([
          JSON.stringify({ userId: "u1", achievementId: "a1", data: {} }),
          null,
        ]),
    });
    const Redis = await loadFreshRedis(client);

    const list = await Redis.getAllSyncDataForCacheKey("ck");
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe("u1");
  });

  it("getPendingSyncKeys strips prefix from members", async () => {
    const client = buildMockClient({
      sMembers: jest
        .fn()
        .mockResolvedValue(["test:user_achieved:a", "test:user_achieved:b"]),
    });
    const Redis = await loadFreshRedis(client);

    expect(await Redis.getPendingSyncKeys()).toEqual([
      "user_achieved:a",
      "user_achieved:b",
    ]);
  });

  it("connect is idempotent when already connected", async () => {
    const client = buildMockClient();
    const Redis = await loadFreshRedis(client);

    await Redis.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("disconnect is no-op when not connected", async () => {
    const client = buildMockClient();
    const Redis = await loadFreshRedis(client);
    await Redis.disconnect();
    await Redis.disconnect();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it("mGet returns [] for empty input without calling client", async () => {
    const client = buildMockClient({
      mGet: jest.fn().mockResolvedValue([]),
    });
    const Redis = await loadFreshRedis(client);

    expect(await Redis.mGet([])).toEqual([]);
    expect(client.mGet).not.toHaveBeenCalled();
  });
});
