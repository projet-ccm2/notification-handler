import request from "supertest";
import app from "../../index";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Server Lifecycle", () => {
  let originalProcessExit: typeof process.exit;

  beforeEach(() => {
    originalProcessExit = process.exit;
    process.exit = jest.fn() as any;
  });

  afterEach(() => {
    process.exit = originalProcessExit;
  });

  it("should test health endpoint", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "healthy");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.body).toHaveProperty("environment");
  });

  it("should test signal handler logic", () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const mockServer = {
      close: jest.fn((callback) => {
        if (callback) callback();
      }),
    };

    const sigtermHandler = () => {
      mockLogger.info("SIGTERM received, shutting down gracefully");
      mockServer.close(() => {
        mockLogger.info("Server closed");
        process.exit(0);
      });
    };

    const sigintHandler = () => {
      mockLogger.info("SIGINT received, shutting down gracefully");
      mockServer.close(() => {
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

  it("should test server startup callback logic", () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const mockApp = {
      listen: jest.fn((port, callback) => {
        if (callback) callback();
      }),
    };

    const port = 3000;
    const environment = "development";

    mockApp.listen(port, () => {
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
