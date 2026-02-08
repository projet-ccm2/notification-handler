import { Request, Response } from "express";
import { CacheController } from "../../../controllers/cache-controller";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../../services/cache-db-service", () => ({
  CacheDbService: {
    clearCacheByChannelId: jest.fn(),
  },
}));

const { CacheDbService } = require("../../../services/cache-db-service");

describe("CacheController", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock, send: sendMock });
    req = { params: {} };
    res = { status: statusMock, json: jsonMock, send: sendMock };
    jest.clearAllMocks();
  });

  describe("clearChannelCache", () => {
    it("returns 204 and calls clearCacheByChannelId when channelId is set", async () => {
      req.params = { channelId: "ch1" };
      (CacheDbService.clearCacheByChannelId as jest.Mock).mockResolvedValue(
        undefined,
      );

      await CacheController.clearChannelCache(req as Request, res as Response);

      expect(CacheDbService.clearCacheByChannelId).toHaveBeenCalledWith("ch1");
      expect(statusMock).toHaveBeenCalledWith(204);
      expect(sendMock).toHaveBeenCalled();
    });

    it("returns 400 when channelId is missing", async () => {
      req.params = {};

      await CacheController.clearChannelCache(req as Request, res as Response);

      expect(CacheDbService.clearCacheByChannelId).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Missing channelId",
        message: "channelId is required",
      });
    });

    it("returns 400 when channelId is empty string", async () => {
      req.params = { channelId: "" };

      await CacheController.clearChannelCache(req as Request, res as Response);

      expect(CacheDbService.clearCacheByChannelId).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("returns 500 and logs when clearCacheByChannelId throws", async () => {
      req.params = { channelId: "ch2" };
      (CacheDbService.clearCacheByChannelId as jest.Mock).mockRejectedValue(
        new Error("Redis down"),
      );

      await CacheController.clearChannelCache(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Internal server error",
        message: "Failed to clear cache",
      });
    });

    it("returns 500 when clearCacheByChannelId rejects with non-Error", async () => {
      req.params = { channelId: "ch3" };
      (CacheDbService.clearCacheByChannelId as jest.Mock).mockRejectedValue(
        "string rejection",
      );

      await CacheController.clearChannelCache(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Internal server error",
        message: "Failed to clear cache",
      });
    });
  });
});
