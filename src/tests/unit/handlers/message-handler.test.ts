import { MessageHandler } from "../../../handlers/message-handler";
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

describe("MessageHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls logger.debug with event and payload message", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "message",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userLogin: "user",
      payload: { message: "hello world" },
    };

    await MessageHandler.handle(event);

    expect(logger.debug).toHaveBeenCalledWith("Processing message event", {
      eventId: "e1",
      channel: "chan",
      user: "user",
      message: "hello world",
    });
  });
});
