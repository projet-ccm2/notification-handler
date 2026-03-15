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
  });
});
