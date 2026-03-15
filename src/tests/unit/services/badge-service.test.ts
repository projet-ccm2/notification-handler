import { BadgeService } from "../../../services/badge-service";

jest.mock("../../../services/db-service", () => ({
  DbService: {
    getChannelBadge: jest.fn(),
    getPossesses: jest.fn(),
    postPossesses: jest.fn(),
  },
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { DbService } = require("../../../services/db-service");
const { logger } = require("../../../utils/logger");

describe("BadgeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips when no badge for channel", async () => {
    (DbService.getChannelBadge as jest.Mock).mockResolvedValue(null);

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(DbService.getChannelBadge).toHaveBeenCalledWith("ch1");
    expect(DbService.getPossesses).not.toHaveBeenCalled();
    expect(DbService.postPossesses).not.toHaveBeenCalled();
  });

  it("skips when user already has badge", async () => {
    (DbService.getChannelBadge as jest.Mock).mockResolvedValue({
      id: "b1",
      title: "Badge",
      img: "badge.png",
    });
    (DbService.getPossesses as jest.Mock).mockResolvedValue({
      userId: "u1",
      badgeId: "b1",
      acquiredDate: "2025-01-01",
    });

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(DbService.getChannelBadge).toHaveBeenCalledWith("ch1");
    expect(DbService.getPossesses).toHaveBeenCalledWith("u1", "b1");
    expect(DbService.postPossesses).not.toHaveBeenCalled();
  });

  it("calls postPossesses when conditions are met", async () => {
    (DbService.getChannelBadge as jest.Mock).mockResolvedValue({
      id: "b1",
      title: "Badge",
      img: "badge.png",
    });
    (DbService.getPossesses as jest.Mock).mockResolvedValue(null);
    (DbService.postPossesses as jest.Mock).mockResolvedValue(undefined);

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(DbService.getChannelBadge).toHaveBeenCalledWith("ch1");
    expect(DbService.getPossesses).toHaveBeenCalledWith("u1", "b1");
    expect(DbService.postPossesses).toHaveBeenCalledWith(
      "u1",
      "b1",
      expect.any(String),
    );
    expect(logger.info).toHaveBeenCalledWith("Badge granted", {
      userId: "u1",
      channelId: "ch1",
      badgeId: "b1",
    });
  });

  it("ignores 409 conflict from postPossesses", async () => {
    (DbService.getChannelBadge as jest.Mock).mockResolvedValue({
      id: "b1",
      title: "Badge",
      img: "badge.png",
    });
    (DbService.getPossesses as jest.Mock).mockResolvedValue(null);
    (DbService.postPossesses as jest.Mock).mockRejectedValue(
      new Error("HTTP 409: Conflict"),
    );

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs error when postPossesses fails with non-409", async () => {
    (DbService.getChannelBadge as jest.Mock).mockResolvedValue({
      id: "b1",
      title: "Badge",
      img: "badge.png",
    });
    (DbService.getPossesses as jest.Mock).mockResolvedValue(null);
    (DbService.postPossesses as jest.Mock).mockRejectedValue(
      new Error("HTTP 500: Server Error"),
    );

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(logger.error).toHaveBeenCalledWith("Failed to grant badge", {
      userId: "u1",
      channelId: "ch1",
      error: "HTTP 500: Server Error",
    });
  });

  it("logs error when thrown value is not Error instance", async () => {
    (DbService.getChannelBadge as jest.Mock).mockRejectedValue("string error");

    await BadgeService.tryGrantBadge("u1", "ch1");

    expect(logger.error).toHaveBeenCalledWith("Failed to grant badge", {
      userId: "u1",
      channelId: "ch1",
      error: "string error",
    });
  });
});
