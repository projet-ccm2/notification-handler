describe("Logger Branch Coverage", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should use debug level in development environment", () => {
    process.env.NODE_ENV = "development";

    const { logger } = require("../../../utils/logger");

    expect(logger).toBeDefined();
    expect(logger.level).toBe("debug");
  });

  it("should use info level in non-development environment", () => {
    process.env.NODE_ENV = "production";

    const { logger } = require("../../../utils/logger");

    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });

  it("should use info level when NODE_ENV is undefined", () => {
    delete process.env.NODE_ENV;

    const { logger } = require("../../../utils/logger");

    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });
});
