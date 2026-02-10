import { ChannelPointRewardHandler } from "../../../handlers/channel-point-reward-handler";
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

describe("ChannelPointRewardHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls logger.debug with event details", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "channel.channel_points_custom_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userId: "u1",
      userLogin: "user",
      payload: {},
    };

    await ChannelPointRewardHandler.handle(event);

    expect(logger.debug).toHaveBeenCalledWith(
      "Processing channel point reward event",
      {
        eventId: "e1",
        type: event.type,
        channel: "chan",
        userId: "u1",
        userLogin: "user",
      },
    );
  });
});
