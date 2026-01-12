import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";

export class UnknownEventHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    logger.warn("Unknown event type received", {
      eventId: event.id,
      type: event.type,
      source: event.source,
    });
  }
}

