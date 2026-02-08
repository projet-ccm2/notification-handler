import { DbService } from "../../../services/db-service";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});

afterAll(() => {
  delete (global as any).fetch;
});

describe("DbService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("getAchievements returns data from API", async () => {
    const data = [
      {
        id: "a1",
        title: "T",
        description: "D",
        goal: 10,
        reward: 5,
        label: "L",
        typeAchievement: { id: "t1", label: "points", data: "{}" },
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    });

    const result = await DbService.getAchievements("ch1");
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/achievements/channel/ch1"),
      expect.any(Object)
    );
  });

  it("getUserAchievements returns achievements from response", async () => {
    const res = {
      userId: "u1",
      channelId: "ch1",
      achievements: [
        {
          id: "a1",
          title: "T",
          description: "D",
          goal: 10,
          reward: 5,
          label: "L",
          typeAchievement: { id: "t1", label: "points", data: "{}" },
          achieved: null,
        },
      ],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(res),
    });

    const result = await DbService.getUserAchievements("u1", "ch1");
    expect(result).toEqual(res.achievements);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/achievements/user/u1/channel/ch1"),
      expect.any(Object)
    );
  });

  it("putAchieved sends PUT request", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await DbService.putAchieved({
      achievementId: "a1",
      userId: "u1",
      count: 1,
      finished: false,
      labelActive: false,
      acquiredDate: "2025-01-01",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/achieved"),
      expect.objectContaining({
        method: "PUT",
        body: expect.any(String),
      })
    );
  });

  it("getAchievements throws when response not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });
    await expect(DbService.getAchievements("ch1")).rejects.toThrow("HTTP 500");
  });

  it("putAchieved throws when response not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });
    await expect(
      DbService.putAchieved({
        achievementId: "a1",
        userId: "u1",
        count: 0,
        finished: false,
        labelActive: false,
        acquiredDate: "",
      })
    ).rejects.toThrow("HTTP 404");
  });
});
