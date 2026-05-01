jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../config/environment", () => ({
  config: {
    nodeEnv: "production",
    port: 3000,
    cors: { allowedOrigins: [] },
    dbGateway: { baseUrl: "http://localhost:8080" },
    redis: { url: "redis://localhost:6379" },
    cache: { ttl: 3600, syncIntervalMs: 60000 },
  },
}));

const RedisServiceMock = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
};
jest.mock("../../services/redis-service", () => ({
  RedisService: RedisServiceMock,
}));
jest.mock("../../services", () => ({
  RedisService: RedisServiceMock,
}));

const CacheDbServiceMock = {
  refreshExpiredCacheEntries: jest.fn().mockResolvedValue(undefined),
};
jest.mock("../../services/cache-db-service", () => ({
  CacheDbService: CacheDbServiceMock,
}));

describe("Production Server", () => {
  let originalEnv: string | undefined;
  let originalProcessExit: typeof process.exit;
  let originalProcessOn: typeof process.on;
  let mockServer: { close: jest.Mock };
  let mockApp: { listen: jest.Mock; get: jest.Mock; disable: jest.Mock; use: jest.Mock };

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalProcessExit = process.exit;
    originalProcessOn = process.on;

    process.env.NODE_ENV = "production";
    process.exit = jest.fn() as unknown as typeof process.exit;
    process.on = jest.fn() as unknown as typeof process.on;

    mockServer = {
      close: jest.fn((callback?: () => void) => {
        if (callback) callback();
      }),
    };

    mockApp = {
      listen: jest.fn((_port: number, callback?: () => void) => {
        if (callback) callback();
        return mockServer;
      }),
      get: jest.fn(),
      disable: jest.fn(),
      use: jest.fn().mockReturnThis(),
    };

    const mockRouter = {
      post: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      use: jest.fn().mockReturnThis(),
    };
    const expressFn = jest.fn(() => mockApp);
    (expressFn as unknown as { json: jest.Mock }).json = jest.fn();
    jest.doMock("express", () => ({
      __esModule: true,
      default: expressFn,
      Router: jest.fn(() => mockRouter),
    }));

    jest.clearAllMocks();
    jest.useFakeTimers();
    RedisServiceMock.connect.mockResolvedValue(undefined);
    RedisServiceMock.disconnect.mockResolvedValue(undefined);
    CacheDbServiceMock.refreshExpiredCacheEntries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
    jest.useRealTimers();
    jest.resetModules();
  });

  const getHandler = (signal: "SIGTERM" | "SIGINT") =>
    (process.on as jest.Mock).mock.calls.find((c) => c[0] === signal)?.[1];

  it("registers listen + signal handlers in production", () => {
    require("../../index");

    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });

  it("connects to Redis on startup", async () => {
    require("../../index");
    await Promise.resolve();
    await Promise.resolve();
    expect(RedisServiceMock.connect).toHaveBeenCalled();
  });

  it("logs error when Redis connect fails on startup", async () => {
    RedisServiceMock.connect.mockRejectedValueOnce(new Error("conn refused"));
    const { logger } = require("../../utils/logger");

    require("../../index");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to connect to Redis",
      expect.objectContaining({ error: "conn refused" }),
    );
  });

  it("logs error when periodic refresh throws", async () => {
    CacheDbServiceMock.refreshExpiredCacheEntries.mockRejectedValueOnce(
      new Error("refresh fail"),
    );
    const { logger } = require("../../utils/logger");

    require("../../index");
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to refresh expired cache entries",
      expect.objectContaining({ error: "refresh fail" }),
    );
  });

  it("SIGTERM: flushes cache, disconnects Redis, closes server, exits 0", async () => {
    require("../../index");
    const handler = getHandler("SIGTERM");
    expect(handler).toBeDefined();

    await handler();

    expect(CacheDbServiceMock.refreshExpiredCacheEntries).toHaveBeenCalledWith(
      true,
    );
    expect(RedisServiceMock.disconnect).toHaveBeenCalled();
    expect(mockServer.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("SIGINT: same shutdown sequence as SIGTERM", async () => {
    require("../../index");
    const handler = getHandler("SIGINT");
    expect(handler).toBeDefined();

    await handler();

    expect(CacheDbServiceMock.refreshExpiredCacheEntries).toHaveBeenCalledWith(
      true,
    );
    expect(RedisServiceMock.disconnect).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("logs error and exits 1 when shutdown fails", async () => {
    RedisServiceMock.disconnect.mockRejectedValueOnce(new Error("disco fail"));
    const { logger } = require("../../utils/logger");

    require("../../index");
    const handler = getHandler("SIGTERM");
    await handler();

    expect(logger.error).toHaveBeenCalledWith(
      "Error during shutdown",
      expect.objectContaining({ error: "disco fail" }),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
