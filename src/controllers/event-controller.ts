import { Request, Response } from "express";
import { TwitchEvent } from "../types";
import { EventHandler } from "../handlers/event-handler";
import { logger } from "../utils/logger";

export class EventController {
  static async handleEvent(req: Request, res: Response): Promise<void> {
    try {
      const events: TwitchEvent[] = req.body;

      if (!Array.isArray(events)) {
        res.status(400).json({
          error: "Invalid request body",
          message: "Expected an array of events",
        });
        return;
      }

      if (events.length === 0) {
        res.status(400).json({
          error: "Invalid request body",
          message: "Events array cannot be empty",
        });
        return;
      }

      const results = [];
      const errors = [];

      for (const event of events) {
        if (!event.id || !event.type || !event.source || !event.timestamp) {
          errors.push({
            eventId: event.id || "unknown",
            error: "Missing required fields: id, type, source, or timestamp",
          });
          continue;
        }

        try {
          await EventHandler.handleEvent(event);
          results.push({
            eventId: event.id,
            status: "success",
          });
        } catch (error) {
          errors.push({
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const statusCode = errors.length === 0 ? 200 : errors.length === events.length ? 500 : 207;

      res.status(statusCode).json({
        status: errors.length === 0 ? "success" : "partial",
        processed: results.length,
        failed: errors.length,
        results,
        ...(errors.length > 0 && { errors }),
      });
    } catch (error) {
      logger.error("Error processing events", {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to process events",
      });
    }
  }
}

