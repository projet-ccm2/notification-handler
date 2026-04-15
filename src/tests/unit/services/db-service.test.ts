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
      expect.any(Object),
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
      expect.any(Object),
    );
  });

  it("saveAchieved sends PUT when record exists", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ achievementId: "a1", userId: "u1" }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });

    await DbService.saveAchieved({
      achievementId: "a1",
      userId: "u1",
      count: 1,
      finished: false,
      labelActive: false,
      acquiredDate: "2025-01-01",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/achieved"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("saveAchieved sends POST when record does not exist", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })
      .mockResolvedValueOnce({ ok: true });

    await DbService.saveAchieved({
      achievementId: "a1",
      userId: "u1",
      count: 1,
      finished: false,
      labelActive: false,
      acquiredDate: "2025-01-01",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/achieved"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getAchievements throws when response not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    await expect(DbService.getAchievements("ch1")).rejects.toThrow("HTTP 500");
  });

  it("getUser returns user from API", async () => {
    const user = {
      id: "u1",
      username: "user1",
      profileImageUrl: null,
      channelDescription: null,
      scope: null,
      lastUpdateTimestamp: "2026-02-20T12:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(user),
    });

    const result = await DbService.getUser("u1");
    expect(result).toEqual(user);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/u1"),
      expect.any(Object),
    );
  });

  it("addExpToUser fetches user and PUTs with increased exp", async () => {
    const user = {
      id: "u1",
      username: "user1",
      profileImageUrl: null,
      channelDescription: null,
      scope: null,
      lastUpdateTimestamp: "2026-02-20T12:00:00.000Z",
      exp: 10,
    };
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(user),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });

    await DbService.addExpToUser("u1", 50);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/users/u1"),
      expect.any(Object),
    );
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toContain("/users/u1");
    expect(JSON.parse(putCall[1].body)).toEqual({ ...user, exp: 60 });
  });

  it("getChannelBadge returns badge from API", async () => {
    const badge = { id: "b1", title: "Badge", img: "badge.png" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(badge),
    });

    const result = await DbService.getChannelBadge("ch1");
    expect(result).toEqual(badge);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/channels/ch1/badge"),
      expect.any(Object),
    );
  });

  it("getChannelBadge returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await DbService.getChannelBadge("ch1");
    expect(result).toBeNull();
  });

  it("getPossesses returns possesses from API", async () => {
    const possesses = {
      userId: "u1",
      badgeId: "b1",
      acquiredDate: "2025-01-01T00:00:00.000Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(possesses),
    });

    const result = await DbService.getPossesses("u1", "b1");
    expect(result).toEqual(possesses);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/possesses"),
      expect.any(Object),
    );
    expect(mockFetch.mock.calls[0][0]).toContain("userId=u1");
    expect(mockFetch.mock.calls[0][0]).toContain("badgeId=b1");
  });

  it("getPossesses returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await DbService.getPossesses("u1", "b1");
    expect(result).toBeNull();
  });

  it("postPossesses sends POST request", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await DbService.postPossesses("u1", "b1", "2025-01-01T00:00:00.000Z");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/possesses"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          userId: "u1",
          badgeId: "b1",
          acquiredDate: "2025-01-01T00:00:00.000Z",
        }),
      }),
    );
  });

  it("getChannelBadge throws on 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    await expect(DbService.getChannelBadge("ch1")).rejects.toThrow("HTTP 500");
  });

  it("getPossesses throws on 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    await expect(DbService.getPossesses("u1", "b1")).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("postPossesses throws when response not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });
    await expect(
      DbService.postPossesses("u1", "b1", "2025-01-01"),
    ).rejects.toThrow("HTTP 400");
  });
});
