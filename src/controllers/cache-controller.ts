import { Request, Response } from "express";
import { CacheDbService } from "../services/cache-db-service";
import { logger } from "../utils/logger";

export class CacheController {
  static async clearChannelCache(req: Request, res: Response): Promise<void> {
    try {
      const channelId = req.params.channelId;
      if (!channelId) {
        res.status(400).json({
          error: "Missing channelId",
          message: "channelId is required",
        });
        return;
      }
      await CacheDbService.clearCacheByChannelId(channelId);
      res.status(204).send();
    } catch (error) {
      logger.error("Error clearing channel cache", {
        channelId: req.params.channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to clear cache",
      });
    }
  }
}
