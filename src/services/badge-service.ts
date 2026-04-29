import { DbService } from "./db-service";
import { logger } from "../utils/logger";

export class BadgeService {
  static async tryGrantBadge(userId: string, channelId: string): Promise<void> {
    try {
      const badge = await DbService.getChannelBadge(channelId);
      if (!badge) return;

      const possesses = await DbService.getPossesses(userId, badge.id);
      if (possesses) return;

      await DbService.postPossesses(userId, badge.id, new Date().toISOString());
      logger.info("Badge granted", { userId, channelId, badgeId: badge.id, context: "badge" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("409")) return;
      logger.error("Failed to grant badge", {
        userId,
        channelId,
        error: message,
        context: "badge",
      });
    }
  }
}
