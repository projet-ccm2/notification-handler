import type { TwitchEvent, MessagePayload } from "../types";
import { CacheDbService } from "../services/cache-db-service";
import { logger } from "../utils/logger";

const COUNT_MESSAGE_TYPE = "countMessage";
const CONTENT_MESSAGE_TYPE = "contentMessage";

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
    const messageContent = payload.message;
    if (!userId || !channelId || !messageContent) {
      logger.error("Missing userId or channelId or messageContent", {
        eventId: event.id,
        channel: event.channelLogin,
        user: event.userLogin,
        message: messageContent,
      });
      return;
    }
    await this.handleCountMessages(userId, channelId);
    await this.handleMessageContent(userId, channelId, payload.message);
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

  static async handleMessageContent(userId: string, channelId: string, message: string): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      CONTENT_MESSAGE_TYPE,
    );
    const lowercaseMessage = message.toLowerCase();
    let achievementLabelLowercase : string
    for (const ua of achievements) {
      achievementLabelLowercase = ua.label.toLowerCase();
      if (lowercaseMessage.includes(achievementLabelLowercase)) {
        ua.achieved.count += 1;
        ua.achieved.finished = ua.achieved.count >= ua.goal;
        await CacheDbService.update(ua);
      }
    }
  }
}
