import { Request, Response } from "express";
import { TwitchEvent } from "../types";
import { EventHandler } from "../handlers/event-handler";
import { logger } from "../utils/logger";

function computeStatusCode(failed: number, total: number): number {
  if (failed === 0) return 200;
  if (failed === total) return 500;
  return 207;
}

function processEvent(
  event: TwitchEvent,
): { eventId: string; status: "success" } | { eventId: string; error: string } {
  if (!event.id || !event.type || !event.source || !event.timestamp) {
    return {
      eventId: event.id || "unknown",
      error: "Missing required fields: id, type, source, or timestamp",
    };
  }
  return { eventId: event.id, status: "success" };
}

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

      const results: Array<{ eventId: string; status: "success" }> = [];
      const errors: Array<{ eventId: string; error: string }> = [];

      for (const event of events) {
        const outcome = processEvent(event);
        if ("error" in outcome) {
          errors.push(outcome);
          continue;
        }

        try {
          await EventHandler.handleEvent(event);
          results.push(outcome);
        } catch (error) {
          errors.push({
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const statusCode = computeStatusCode(errors.length, events.length);

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
        context: "event-controller",
      });

      res.status(500).json({
        error: "Internal server error",
        message: "Failed to process events",
      });
    }
  }
}
