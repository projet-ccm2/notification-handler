import { Server } from "http";

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
    cache: { ttl: 3600 },
  },
}));

jest.mock("../../services/redis-service", () => ({
  RedisService: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("Production Server", () => {
  let originalEnv: string | undefined;
  let originalProcessExit: typeof process.exit;
  let originalProcessOn: typeof process.on;
  let mockServer: any;
  let mockApp: any;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalProcessExit = process.exit;
    originalProcessOn = process.on;

    process.env.NODE_ENV = "production";
    process.exit = jest.fn() as any;
    process.on = jest.fn() as any;

    mockServer = {
      close: jest.fn((callback) => {
        if (callback) callback();
      }),
    };

    mockApp = {
      listen: jest.fn((port, callback) => {
        if (callback) callback();
        return mockServer;
      }),
      get: jest.fn(),
      disable: jest.fn(),
      use: jest.fn().mockReturnThis(),
    };

    const mockRouter = { post: jest.fn().mockReturnThis(), get: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(), use: jest.fn().mockReturnThis() };
    const expressFn = jest.fn(() => mockApp);
    (expressFn as any).json = jest.fn();
    jest.doMock("express", () => ({
      __esModule: true,
      default: expressFn,
      Router: jest.fn(() => mockRouter),
    }));

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
    jest.resetModules();
  });

  it("should start server in production environment", () => {
    require("../../index");

    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });

  it("should handle SIGTERM in production", async () => {
    require("../../index");

    const sigtermHandler = (process.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "SIGTERM",
    )?.[1];

    expect(sigtermHandler).toBeDefined();

    if (sigtermHandler) {
      await sigtermHandler();
      expect(mockServer.close).toHaveBeenCalled();
    }
  });

  it("should handle SIGINT in production", async () => {
    require("../../index");

    const sigintHandler = (process.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "SIGINT",
    )?.[1];

    expect(sigintHandler).toBeDefined();

    if (sigintHandler) {
      await sigintHandler();
      expect(mockServer.close).toHaveBeenCalled();
    }
  });
});
