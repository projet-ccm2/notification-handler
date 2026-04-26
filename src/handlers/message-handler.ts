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
    const ctx = { channelLogin: event.channelLogin, userLogin: event.userLogin };
    await this.handleCountMessages(userId, channelId, ctx);
    await this.handleMessageContent(userId, channelId, payload.message, ctx);
  }

  static async handleCountMessages(
    userId: string,
    channelId: string,
    ctx: { channelLogin?: string; userLogin?: string } = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_MESSAGE_TYPE,
    );
    logger.debug("Count message achievements found", {
      userId,
      channelId,
      count: achievements.length,
      achievements: achievements.map((a) => ({
        id: a.id,
        goal: a.goal,
        currentCount: a.achieved?.count,
        finished: a.achieved?.finished,
      })),
    });
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
    ctx: { channelLogin?: string; userLogin?: string } = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      CONTENT_MESSAGE_TYPE,
    );
    logger.debug("Content message achievements found", {
      userId,
      channelId,
      count: achievements.length,
      achievements: achievements.map((a) => ({
        id: a.id,
        label: a.label,
        goal: a.goal,
        currentCount: a.achieved?.count,
        finished: a.achieved?.finished,
      })),
    });
    const lowercaseMessage = message.toLowerCase();
    let typeDataLowercase: string;
    for (const ua of achievements) {
      typeDataLowercase = ua.typeAchievement.data.toLowerCase();
      if (lowercaseMessage.includes(typeDataLowercase)) {
        ua.achieved.count += 1;
        ua.achieved.finished = ua.achieved.count >= ua.goal;
        await CacheDbService.update(ua, ctx);
      }
    }
  }
}
