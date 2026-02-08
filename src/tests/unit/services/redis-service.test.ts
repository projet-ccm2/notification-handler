import { RedisService } from "../../../services/redis-service";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

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
  setNX: jest.fn(),
  expire: jest.fn(),
  keys: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn((ev: string, cb: () => void) => {
    if (ev === "ready") cb();
  }),
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
    expect(mockClient.setEx).toHaveBeenCalledWith("k", 60, expect.any(String));
    expect(mockClient.set).not.toHaveBeenCalled();
  });

  it("set uses set when ttl not provided", async () => {
    mockClient.set.mockResolvedValue("OK");
    await RedisService.set("k", "v");
    expect(mockClient.set).toHaveBeenCalledWith("k", expect.any(String));
    expect(mockClient.setEx).not.toHaveBeenCalled();
  });

  it("acquireLock sets expire when lock acquired", async () => {
    mockClient.setNX.mockResolvedValue(true);
    mockClient.expire.mockResolvedValue(true);
    const result = await RedisService.acquireLock("lock:1", 15);
    expect(result).toBe(true);
    expect(mockClient.expire).toHaveBeenCalledWith("lock:1", 15);
  });

  it("acquireLock returns false when setNX fails", async () => {
    mockClient.setNX.mockResolvedValue(false);
    const result = await RedisService.acquireLock("lock:2", 10);
    expect(result).toBe(false);
    expect(mockClient.expire).not.toHaveBeenCalled();
  });
});
