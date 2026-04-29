import { ChannelPointRewardHandler } from "../../../handlers/channel-point-reward-handler";
import type { TwitchEvent } from "../../../types";
import { CacheDbService } from "../../../services/cache-db-service";
import { UserAchievement } from "../../../types/classes/user-achievement";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../../services/cache-db-service");

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
      channelId: "ch1",
      payload: { reward: { id: "r1", cost: 100 } },
    };

    jest.mocked(CacheDbService.getAchievements).mockResolvedValue([]);

    await ChannelPointRewardHandler.handle(event);

    expect(logger.debug).toHaveBeenCalledWith(
      "Processing channel point reward event",
      {
        eventId: "e1",
        type: event.type,
        channel: "chan",
        userId: "u1",
        userLogin: "user",
        context: "channel-points-handler",
      },
    );
  });

  it("logs error and returns when userId or channelId is missing", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "channel.channel_points_custom_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userLogin: "user",
      payload: { reward: { cost: 100 } },
    };

    await ChannelPointRewardHandler.handle(event);

    expect(logger.error).toHaveBeenCalledWith(
      "Missing userId or channelId",
      expect.any(Object),
    );
    expect(CacheDbService.getAchievements).not.toHaveBeenCalled();
  });

  it("calls handleCountChannelPointRewardUse when payload has reward.id (custom reward)", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "channel.channel_points_custom_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userId: "u1",
      userLogin: "user",
      channelId: "ch1",
      payload: { reward: { id: "reward-123", cost: 500 } },
    };

    jest.mocked(CacheDbService.getAchievements).mockResolvedValue([]);

    await ChannelPointRewardHandler.handle(event);

    expect(CacheDbService.getAchievements).toHaveBeenCalledWith(
      "ch1",
      "u1",
      "countChannelPointReward",
    );
    expect(CacheDbService.getAchievements).toHaveBeenCalledWith(
      "ch1",
      "u1",
      "countChannelPointRewardCost",
    );
  });

  it("only calls handleCountChannelPointRewardCost when payload has no reward.id (automatic reward)", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "channel.channel_points_automatic_reward_redemption.add",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userId: "u1",
      userLogin: "user",
      channelId: "ch1",
      payload: {
        reward: { type: "auto", cost: 300, unlockedEmote: null },
        message: { text: "", emotes: [] },
      },
    };

    jest.mocked(CacheDbService.getAchievements).mockResolvedValue([]);

    await ChannelPointRewardHandler.handle(event);

    expect(CacheDbService.getAchievements).toHaveBeenCalledWith(
      "ch1",
      "u1",
      "countChannelPointRewardCost",
    );
    expect(CacheDbService.getAchievements).not.toHaveBeenCalledWith(
      "ch1",
      "u1",
      "countChannelPointReward",
    );
  });

  describe("handleCountChannelPointRewardUse", () => {
    it("updates achievement when label matches idChannelPointReward", async () => {
      const ua = new UserAchievement(
        "a1",
        "Use reward",
        "desc",
        5,
        50,
        "reward-123",
        { id: "t1", label: "countChannelPointReward", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await ChannelPointRewardHandler.handleCountChannelPointRewardUse(
        "u1",
        "ch1",
        "reward-123",
      );

      expect(ua.achieved.count).toBe(1);
      expect(CacheDbService.update).toHaveBeenCalledWith(ua, {});
    });

    it("does not update when label does not match", async () => {
      const ua = new UserAchievement(
        "a1",
        "Use reward",
        "desc",
        5,
        50,
        "other-reward",
        { id: "t1", label: "countChannelPointReward", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);

      await ChannelPointRewardHandler.handleCountChannelPointRewardUse(
        "u1",
        "ch1",
        "reward-123",
      );

      expect(ua.achieved.count).toBe(0);
      expect(CacheDbService.update).not.toHaveBeenCalled();
    });
  });

  describe("handleCountChannelPointRewardCost", () => {
    it("adds cost to achievement count and updates", async () => {
      const ua = new UserAchievement(
        "a1",
        "Spend points",
        "desc",
        1000,
        100,
        "label",
        { id: "t1", label: "countChannelPointRewardCost", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await ChannelPointRewardHandler.handleCountChannelPointRewardCost(
        "u1",
        "ch1",
        250,
      );

      expect(ua.achieved.count).toBe(250);
      expect(ua.achieved.finished).toBe(false);
      expect(CacheDbService.update).toHaveBeenCalledWith(ua, {});
    });

    it("sets finished when count reaches goal", async () => {
      const achieved = UserAchievement.defaultAchieved("a1", "u1");
      achieved.count = 700;
      const ua = new UserAchievement(
        "a1",
        "Spend points",
        "desc",
        1000,
        100,
        "label",
        { id: "t1", label: "countChannelPointRewardCost", data: "{}" },
        achieved,
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await ChannelPointRewardHandler.handleCountChannelPointRewardCost(
        "u1",
        "ch1",
        300,
      );

      expect(ua.achieved.count).toBe(1000);
      expect(ua.achieved.finished).toBe(true);
    });
  });
});
