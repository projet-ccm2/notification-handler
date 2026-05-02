import { TwitchChatService } from "../../../services/twitch-chat-service";

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

describe("TwitchChatService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (logger.error as jest.Mock).mockClear();
  });

  it("sendAchievementUnlocked posts the message and does not log on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });

    await TwitchChatService.sendAchievementUnlocked(
      "chan",
      "user",
      "First steps",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/chat/message"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("First steps"),
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("sendBadgeGranted logs error when response is not ok", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    });

    await TwitchChatService.sendBadgeGranted("chan", "user");

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send Twitch chat message",
      expect.objectContaining({ status: 500, channelLogin: "chan" }),
    );
  });

  it("logs error when response.text rejects but ok is false", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error("body read fail")),
    });

    await TwitchChatService.sendAchievementUnlocked("chan", "user", "T");

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send Twitch chat message",
      expect.objectContaining({ status: 502, responseBody: "" }),
    );
  });

  it("logs error when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    await TwitchChatService.sendAchievementUnlocked("chan", "user", "T");

    expect(logger.error).toHaveBeenCalledWith(
      "Error sending Twitch chat message",
      expect.objectContaining({ error: "network down" }),
    );
  });

  it("serializes non-Error throw as string", async () => {
    mockFetch.mockRejectedValue("string failure");

    await TwitchChatService.sendBadgeGranted("chan", "user");

    expect(logger.error).toHaveBeenCalledWith(
      "Error sending Twitch chat message",
      expect.objectContaining({ error: "string failure" }),
    );
  });
});
