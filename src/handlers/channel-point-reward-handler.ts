import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";

export class ChannelPointRewardHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    logger.debug("Processing channel point reward event", {
      eventId: event.id,
      type: event.type,
      channel: event.channelLogin,
      userId: event.userId,
      userLogin: event.userLogin,
    });
  }
}
