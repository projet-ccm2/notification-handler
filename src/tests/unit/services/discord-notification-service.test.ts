import { DiscordNotificationService } from "../../../services/discord-notification-service";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { logger } = require("../../../utils/logger");
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  delete (global as { fetch?: unknown }).fetch;
});

describe("DiscordNotificationService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (logger.error as jest.Mock).mockClear();
  });

  it("posts a notify request and does not log on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });

    await DiscordNotificationService.sendAchievementUnlocked(
      "ch1",
      "user",
      "Title",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/notify"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Title"),
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs error when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("server error"),
    });

    await DiscordNotificationService.sendAchievementUnlocked(
      "ch1",
      "user",
      "T",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send Discord notification",
      expect.objectContaining({ status: 500, channelId: "ch1" }),
    );
  });

  it("logs error when text() rejects", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error("read fail")),
    });

    await DiscordNotificationService.sendAchievementUnlocked(
      "ch1",
      "user",
      "T",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send Discord notification",
      expect.objectContaining({ responseBody: "" }),
    );
  });

  it("logs error when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    await DiscordNotificationService.sendAchievementUnlocked(
      "ch1",
      "user",
      "T",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Error sending Discord notification",
      expect.objectContaining({ error: "network down" }),
    );
  });

  it("serializes non-Error rejections as string", async () => {
    mockFetch.mockRejectedValue("not an Error");

    await DiscordNotificationService.sendAchievementUnlocked(
      "ch1",
      "user",
      "T",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Error sending Discord notification",
      expect.objectContaining({ error: "not an Error" }),
    );
  });
});
