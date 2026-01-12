import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";
import { MessageHandler } from "./message-handler";
import { ChannelPointRewardHandler } from "./channel-point-reward-handler";
import { UnknownEventHandler } from "./unknown-event-handler";

export class EventHandler {
  static async handleEvent(event: TwitchEvent): Promise<void> {
    try {
      switch (event.type) {
        case "message":
          await MessageHandler.handle(event);
          break;
        case "channel.channel_points_custom_reward_redemption.add":
        case "channel.channel_points_automatic_reward_redemption.add":
          await ChannelPointRewardHandler.handle(event);
          break;
        default:
          await UnknownEventHandler.handle(event);
          break;
      }
    } catch (error) {
      logger.error("Error handling event", {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

