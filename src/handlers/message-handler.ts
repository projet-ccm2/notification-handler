import type { TwitchEvent, MessagePayload } from "../types";
import { CacheDbService, EventCtx } from "../services/cache-db-service";
import { logger } from "../utils/logger";

const COUNT_MESSAGE_TYPE = "countMessage";
const CONTENT_MESSAGE_TYPE = "contentMessage";

export class MessageHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    const payload = event.payload as MessagePayload;

    const userId = event.userId;
    const channelId = event.channelId;
    const messageContent = payload.message;
    if (!userId || !channelId || !messageContent) {
      logger.error("Missing userId or channelId or messageContent", {
        eventId: event.id,
        channel: event.channelLogin,
        user: event.userLogin,
        message: messageContent,
        context: "message-handler",
      });
      return;
    }
    const ctx = {
      channelLogin: event.channelLogin,
      userLogin: event.userLogin,
    };
    await this.handleCountMessages(userId, channelId, ctx);
    await this.handleMessageContent(userId, channelId, payload.message, ctx);
  }

  static async handleCountMessages(
    userId: string,
    channelId: string,
    ctx: EventCtx = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_MESSAGE_TYPE,
    );
    for (const ua of achievements) {
      ua.achieved.count += 1;
      ua.achieved.finished = ua.achieved.count >= ua.goal;
      await CacheDbService.update(ua, ctx);
    }
  }

  static async handleMessageContent(
    userId: string,
    channelId: string,
    message: string,
    ctx: EventCtx = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      CONTENT_MESSAGE_TYPE,
    );
    const lowercaseMessage = message.toLowerCase();
    for (const ua of achievements) {
      const typeDataLowercase = ua.typeAchievement.data.toLowerCase();
      if (lowercaseMessage.includes(typeDataLowercase)) {
        ua.achieved.count += 1;
        ua.achieved.finished = ua.achieved.count >= ua.goal;
        await CacheDbService.update(ua, ctx);
      }
    }
  }
}
