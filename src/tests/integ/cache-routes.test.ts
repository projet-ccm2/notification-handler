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

jest.mock("../../services/redis-service", () => ({
  RedisService: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../services/cache-db-service", () => ({
  CacheDbService: {
    clearCacheByChannelId: jest.fn().mockResolvedValue(undefined),
  },
}));

const { CacheDbService } = require("../../services/cache-db-service");

describe("DELETE /cache/channel/:channelId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 204 and clears cache when channelId is provided", async () => {
    const response = await request(app).delete("/cache/channel/ch123");

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(CacheDbService.clearCacheByChannelId).toHaveBeenCalledWith("ch123");
  });

  it("returns 404 when path has no channelId segment", async () => {
    const response = await request(app).delete("/cache/channel/");

    expect(response.status).toBe(404);
    expect(CacheDbService.clearCacheByChannelId).not.toHaveBeenCalled();
  });

  it("returns 500 when clearCacheByChannelId throws", async () => {
    (CacheDbService.clearCacheByChannelId as jest.Mock).mockRejectedValueOnce(
      new Error("Redis error")
    );

    const response = await request(app).delete("/cache/channel/ch456");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Internal server error");
    expect(response.body.message).toBe("Failed to clear cache");
  });
});
