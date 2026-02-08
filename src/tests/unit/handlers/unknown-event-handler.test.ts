import { UnknownEventHandler } from "../../../handlers/unknown-event-handler";
import type { TwitchEvent } from "../../../types";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { logger } = require("../../../utils/logger");

describe("UnknownEventHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls logger.warn with event id, type and source", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "unknown.type",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: {},
    };

    await UnknownEventHandler.handle(event);

    expect(logger.warn).toHaveBeenCalledWith("Unknown event type received", {
      eventId: "e1",
      type: "unknown.type",
      source: "twitch",
    });
  });
});
