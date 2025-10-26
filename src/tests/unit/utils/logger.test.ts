import { logger } from "../../../utils/logger";

jest.mock("winston", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

describe("Logger", () => {
  it("should export logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should have all required methods", () => {
    const requiredMethods = ["info", "error", "warn", "debug"];

    requiredMethods.forEach((method) => {
      expect(logger).toHaveProperty(method);
      expect(typeof logger[method as keyof typeof logger]).toBe("function");
    });
  });
});
