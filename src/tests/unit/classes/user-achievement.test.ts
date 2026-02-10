import { UserAchievement } from "../../../types/classes/user-achievement";

describe("UserAchievement", () => {
  it("fromApi builds instance from API item", () => {
    const item = {
      id: "a1",
      title: "T",
      description: "D",
      goal: 10,
      reward: 5,
      label: "L",
      typeAchievement: { id: "t1", label: "points", data: "{}" },
      achieved: {
        achievementId: "a1",
        userId: "u1",
        count: 1,
        finished: false,
        labelActive: true,
        acquiredDate: "2025-01-01",
      },
    };
    const u = UserAchievement.fromApi(item, "ch1");
    expect(u.id).toBe("a1");
    expect(u.channelId).toBe("ch1");
    expect(u.achieved?.userId).toBe("u1");
  });

  it("fromMerged builds instance from definition and achieved", () => {
    const def = {
      id: "a2",
      title: "T2",
      description: "D2",
      goal: 5,
      reward: 2,
      label: "L2",
      typeAchievement: { id: "t2", label: "badge", data: "{}" },
    };
    const achieved = {
      achievementId: "a2",
      userId: "u2",
      count: 3,
      finished: true,
      labelActive: false,
      acquiredDate: "2025-02-01",
    };
    const u = UserAchievement.fromMerged(def, achieved, "ch2");
    expect(u.id).toBe("a2");
    expect(u.achieved?.count).toBe(3);
    expect(u.achieved?.finished).toBe(true);
  });

  it("toCacheAchieved returns achieved when set", () => {
    const achieved = {
      achievementId: "a3",
      userId: "u3",
      count: 0,
      finished: false,
      labelActive: false,
      acquiredDate: "",
    };
    const u = new UserAchievement(
      "a3",
      "T",
      "D",
      1,
      1,
      "L",
      null,
      achieved,
      "ch3",
    );
    expect(u.toCacheAchieved()).toEqual(achieved);
  });

  it("toCacheAchieved throws when achieved is null", () => {
    const u = new UserAchievement("a4", "T", "D", 1, 1, "L", null, null, "ch4");
    expect(() => u.toCacheAchieved()).toThrow(
      "UserAchievement.toCacheAchieved requires achieved to be set",
    );
  });
});
