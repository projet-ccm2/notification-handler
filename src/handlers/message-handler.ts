import type { TwitchEvent } from "../types";
import type { MessagePayload } from "../types";
import { logger } from "../utils/logger";

export class MessageHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    const payload = event.payload as MessagePayload;
    logger.debug("Processing message event", {
      eventId: event.id,
      channel: event.channelLogin,
      user: event.userLogin,
      message: payload.message,
    });


  }
}

