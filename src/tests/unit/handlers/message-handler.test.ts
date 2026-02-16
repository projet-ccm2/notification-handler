import { MessageHandler } from "../../../handlers/message-handler";
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
      channelId: "ch1",
      userId: "u1",
      payload: { message: "hello world" },
    };

    jest.mocked(CacheDbService.getAchievements).mockResolvedValue([]);

    await MessageHandler.handle(event);

    expect(logger.debug).toHaveBeenCalledWith("Processing message event", {
      eventId: "e1",
      channel: "chan",
      user: "user",
      message: "hello world",
    });
  });

  it("logs error and returns when userId or channelId or messageContent is missing", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "message",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userLogin: "user",
      payload: { message: "" },
    };

    await MessageHandler.handle(event);

    expect(logger.error).toHaveBeenCalledWith(
      "Missing userId or channelId or messageContent",
      expect.any(Object),
    );
    expect(CacheDbService.getAchievements).not.toHaveBeenCalled();
  });

  it("calls handleCountMessages and handleMessageContent when all params present", async () => {
    const event: TwitchEvent = {
      id: "e1",
      type: "message",
      source: "twitch",
      timestamp: "2025-01-01T00:00:00Z",
      channelLogin: "chan",
      userLogin: "user",
      channelId: "ch1",
      userId: "u1",
      payload: { message: "hello world" },
    };

    const mockAchievements = [
      new UserAchievement(
        "a1",
        "Count messages",
        "desc",
        10,
        100,
        "label",
        { id: "t1", label: "countMessage", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      ),
    ];
    jest
      .mocked(CacheDbService.getAchievements)
      .mockResolvedValue(mockAchievements);
    jest.mocked(CacheDbService.update).mockResolvedValue();

    await MessageHandler.handle(event);

    expect(CacheDbService.getAchievements).toHaveBeenCalledWith(
      "ch1",
      "u1",
      "countMessage",
    );
    expect(CacheDbService.getAchievements).toHaveBeenCalledWith(
      "ch1",
      "u1",
      "contentMessage",
    );
    expect(CacheDbService.update).toHaveBeenCalled();
  });

  describe("handleCountMessages", () => {
    it("increments count and updates each countMessage achievement", async () => {
      const ua = new UserAchievement(
        "a1",
        "Count messages",
        "desc",
        5,
        50,
        "label",
        { id: "t1", label: "countMessage", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await MessageHandler.handleCountMessages("u1", "ch1");

      expect(ua.achieved.count).toBe(1);
      expect(ua.achieved.finished).toBe(false);
      expect(CacheDbService.update).toHaveBeenCalledWith(ua);
    });

    it("sets finished when count reaches goal", async () => {
      const achieved = UserAchievement.defaultAchieved("a1", "u1");
      achieved.count = 4;
      const ua = new UserAchievement(
        "a1",
        "Count messages",
        "desc",
        5,
        50,
        "label",
        { id: "t1", label: "countMessage", data: "{}" },
        achieved,
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await MessageHandler.handleCountMessages("u1", "ch1");

      expect(ua.achieved.count).toBe(5);
      expect(ua.achieved.finished).toBe(true);
    });
  });

  describe("handleMessageContent", () => {
    it("increments achievement when message includes label", async () => {
      const ua = new UserAchievement(
        "a1",
        "Say hello",
        "desc",
        3,
        30,
        "Hello",
        { id: "t1", label: "contentMessage", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await MessageHandler.handleMessageContent("u1", "ch1", "Hello everyone!");

      expect(ua.achieved.count).toBe(1);
      expect(CacheDbService.update).toHaveBeenCalledWith(ua);
    });

    it("does not update when message does not include label", async () => {
      const ua = new UserAchievement(
        "a1",
        "Say hello",
        "desc",
        3,
        30,
        "hello",
        { id: "t1", label: "contentMessage", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);

      await MessageHandler.handleMessageContent("u1", "ch1", "goodbye world");

      expect(ua.achieved.count).toBe(0);
      expect(CacheDbService.update).not.toHaveBeenCalled();
    });

    it("matches label case-insensitively", async () => {
      const ua = new UserAchievement(
        "a1",
        "Say hello",
        "desc",
        3,
        30,
        "HELLO",
        { id: "t1", label: "contentMessage", data: "{}" },
        UserAchievement.defaultAchieved("a1", "u1"),
        "ch1",
      );
      jest.mocked(CacheDbService.getAchievements).mockResolvedValue([ua]);
      jest.mocked(CacheDbService.update).mockResolvedValue();

      await MessageHandler.handleMessageContent("u1", "ch1", "hello world");

      expect(ua.achieved.count).toBe(1);
      expect(CacheDbService.update).toHaveBeenCalled();
    });
  });
});
