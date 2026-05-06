import { EventHandler } from "../../../handlers/event-handler";
import { MessageHandler } from "../../../handlers/message-handler";
import { ChannelPointRewardHandler } from "../../../handlers/channel-point-reward-handler";
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

jest.mock("../../../handlers/message-handler", () => ({
  MessageHandler: { handle: jest.fn() },
}));
jest.mock("../../../handlers/channel-point-reward-handler", () => ({
  ChannelPointRewardHandler: { handle: jest.fn() },
}));
jest.mock("../../../handlers/unknown-event-handler", () => ({
  UnknownEventHandler: { handle: jest.fn() },
}));

describe("EventHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls MessageHandler when type is message", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "message",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: { message: "hello" },
    };
    (MessageHandler.handle as jest.Mock).mockResolvedValue(undefined);

    await EventHandler.handleEvent(event);

    expect(MessageHandler.handle).toHaveBeenCalledWith(event);
    expect(ChannelPointRewardHandler.handle).not.toHaveBeenCalled();
    expect(UnknownEventHandler.handle).not.toHaveBeenCalled();
  });

  it("calls ChannelPointRewardHandler for custom reward redemption", async () => {
    const event: TwitchEvent = {
      id: "e2",
      type: "channel.channel_points_custom_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: {},
    };
    (ChannelPointRewardHandler.handle as jest.Mock).mockResolvedValue(
      undefined,
    );

    await EventHandler.handleEvent(event);

    expect(ChannelPointRewardHandler.handle).toHaveBeenCalledWith(event);
    expect(MessageHandler.handle).not.toHaveBeenCalled();
    expect(UnknownEventHandler.handle).not.toHaveBeenCalled();
  });

  it("calls ChannelPointRewardHandler for automatic reward redemption", async () => {
    const event: TwitchEvent = {
      id: "e3",
      type: "channel.channel_points_automatic_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: {},
    };
    (ChannelPointRewardHandler.handle as jest.Mock).mockResolvedValue(
      undefined,
    );

    await EventHandler.handleEvent(event);

    expect(ChannelPointRewardHandler.handle).toHaveBeenCalledWith(event);
    expect(UnknownEventHandler.handle).not.toHaveBeenCalled();
  });

  it("calls UnknownEventHandler for unknown type", async () => {
    const event: TwitchEvent = {
      id: "e4",
      type: "other.type",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: {},
    };
    (UnknownEventHandler.handle as jest.Mock).mockResolvedValue(undefined);

    await EventHandler.handleEvent(event);

    expect(UnknownEventHandler.handle).toHaveBeenCalledWith(event);
    expect(MessageHandler.handle).not.toHaveBeenCalled();
    expect(ChannelPointRewardHandler.handle).not.toHaveBeenCalled();
  });

  it("logs and rethrows when handler throws", async () => {
    const event: TwitchEvent = {
      id: "e5",
      type: "message",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      payload: {},
    };
    (MessageHandler.handle as jest.Mock).mockRejectedValue(
      new Error("Handler fail"),
    );

    await expect(EventHandler.handleEvent(event)).rejects.toThrow(
      "Handler fail",
    );
  });
});
