import { Request, Response } from "express";
import { TwitchEvent } from "../types";
import { EventHandler } from "../handlers/event-handler";
import { logger } from "../utils/logger";

export class EventController {
  static async handleEvent(req: Request, res: Response): Promise<void> {
    try {
      const event: TwitchEvent = req.body;

      if (!event.id || !event.type || !event.source || !event.timestamp) {
        res.status(400).json({
          error: "Invalid event structure",
          message: "Missing required fields: id, type, source, or timestamp",
        });
        return;
      }

      await EventHandler.handleEvent(event);

      res.status(200).json({
        status: "success",
        eventId: event.id,
        message: "Event processed successfully",
      });
    } catch (error) {
      logger.error("Error processing event", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to process event",
      });
    }
  }
}

