import { EventHandler } from "../../../handlers/event-handler";
import { MessageHandler } from "../../../handlers/message-handler";
import { ChannelPointRewardHandler } from "../../../handlers/channel-point-reward-handler";
import { UnknownEventHandler } from "../../../handlers/unknown-event-handler";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const baseEvent = {
  id: "evt1",
  timestamp: "2025-01-01T00:00:00Z",
  version: "1.0",
  source: "twitch",
  type: "message",
  payload: {},
};

describe("EventHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates message event to MessageHandler", async () => {
    const spy = jest.spyOn(MessageHandler, "handle");
    await EventHandler.handleEvent({ ...baseEvent, type: "message", payload: { message: "hi" } });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt1",
        type: "message",
        payload: { message: "hi" },
      })
    );
  });

  it("delegates channel_points_custom_reward_redemption to ChannelPointRewardHandler", async () => {
    const spy = jest.spyOn(ChannelPointRewardHandler, "handle");
    await EventHandler.handleEvent({
      ...baseEvent,
      type: "channel.channel_points_custom_reward_redemption.add",
      channelLogin: "ch",
      userId: "u1",
      userLogin: "user",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "channel.channel_points_custom_reward_redemption.add",
        channelLogin: "ch",
        userId: "u1",
      })
    );
  });

  it("delegates channel_points_automatic_reward_redemption to ChannelPointRewardHandler", async () => {
    const spy = jest.spyOn(ChannelPointRewardHandler, "handle");
    await EventHandler.handleEvent({
      ...baseEvent,
      type: "channel.channel_points_automatic_reward_redemption.add",
    });
    expect(spy).toHaveBeenCalled();
  });

  it("delegates unknown event type to UnknownEventHandler", async () => {
    const spy = jest.spyOn(UnknownEventHandler, "handle");
    await EventHandler.handleEvent({
      ...baseEvent,
      type: "unknown.type",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "unknown.type",
      })
    );
  });

  it("rethrows when handler throws", async () => {
    jest.spyOn(MessageHandler, "handle").mockRejectedValue(new Error("Handler failed"));
    await expect(
      EventHandler.handleEvent({ ...baseEvent, type: "message", payload: {} })
    ).rejects.toThrow("Handler failed");
  });
});
