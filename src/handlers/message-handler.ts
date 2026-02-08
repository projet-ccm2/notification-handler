import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";

export class MessageHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    logger.debug("Processing message event", {
      eventId: event.id,
      channel: event.channelLogin,
      user: event.userLogin,
      message: event.payload.message,
    });


  }
}

