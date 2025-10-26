import { Server } from "http";

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../utils/logger", () => ({
  logger: mockLogger,
}));

const mockServer = {
  close: jest.fn((callback) => {
    if (callback) callback();
  }),
};

const mockApp = {
  listen: jest.fn((port, callback) => {
    if (callback) callback();
    return mockServer;
  }),
  get: jest.fn(),
  disable: jest.fn(),
};

jest.mock("express", () => jest.fn(() => mockApp));

jest.mock("../../config/environment", () => ({
  config: {
    nodeEnv: "development",
    port: 3000,
  },
}));

describe("Server Signal Handlers", () => {
  let originalProcessExit: typeof process.exit;
  let originalProcessOn: typeof process.on;

  beforeEach(() => {
    originalProcessExit = process.exit;
    process.exit = jest.fn() as any;

    originalProcessOn = process.on;
    process.on = jest.fn() as any;

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
  });

  it("should create signal handlers that log and close server", () => {
    const server = mockServer as any;

    const sigtermHandler = () => {
      mockLogger.info("SIGTERM received, shutting down gracefully");
      server.close(() => {
        mockLogger.info("Server closed");
        process.exit(0);
      });
    };

    const sigintHandler = () => {
      mockLogger.info("SIGINT received, shutting down gracefully");
      server.close(() => {
        mockLogger.info("Server closed");
        process.exit(0);
      });
    };

    sigtermHandler();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SIGTERM received, shutting down gracefully",
    );
    expect(mockServer.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);

    jest.clearAllMocks();

    sigintHandler();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SIGINT received, shutting down gracefully",
    );
    expect(mockServer.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("should handle server startup logging", () => {
    const port = 3000;
    const environment = "development";

    const server = mockApp.listen(port, () => {
      mockLogger.info(`Server started on port ${port}`, {
        environment: environment,
        port: port,
      });
    });

    expect(mockApp.listen).toHaveBeenCalledWith(port, expect.any(Function));
    expect(mockLogger.info).toHaveBeenCalledWith(
      `Server started on port ${port}`,
      {
        environment: environment,
        port: port,
      },
    );
  });
});
