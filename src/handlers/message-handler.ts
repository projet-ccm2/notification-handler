import type { TwitchEvent, MessagePayload } from "../types";
import { CacheDbService } from "../services/cache-db-service";
import { logger } from "../utils/logger";

const COUNT_MESSAGE_TYPE = "countMessage";

export class MessageHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    const payload = event.payload as MessagePayload;
    logger.debug("Processing message event", {
      eventId: event.id,
      channel: event.channelLogin,
      user: event.userLogin,
      message: payload.message,
    });

    const userId = event.userId;
    const channelId = event.channelId;
    if (!userId || !channelId) {
      logger.error("Missing userId or channelId", {
        eventId: event.id,
        channel: event.channelLogin,
        user: event.userLogin,
      });
      return;
    }
    await this.handleCountMessages(userId, channelId);
  }

  static async handleCountMessages(
    userId: string,
    channelId: string,
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_MESSAGE_TYPE,
    );
    for (const ua of achievements) {
      ua.achieved.count += 1;
      ua.achieved.finished = ua.achieved.count >= ua.goal;
      await CacheDbService.update(ua);
    }
  }
}
