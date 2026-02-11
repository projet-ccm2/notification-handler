import type {
  Achieved,
  ApiUserAchievementItem,
  AchievementWithType,
  TypeAchievement,
} from "../interfaces/achievement";

type AchievementWithRequiredType = AchievementWithType & {
  typeAchievement: TypeAchievement;
};

export class UserAchievement {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly description: string,
    public readonly goal: number,
    public readonly reward: number,
    public readonly label: string,
    public readonly typeAchievement: TypeAchievement,
    public readonly achieved: Achieved,
    public readonly channelId: string,
  ) {}

  static defaultAchieved(achievementId: string, userId: string): Achieved {
    return {
      achievementId,
      userId,
      count: 0,
      finished: false,
      labelActive: false,
      acquiredDate: "",
    };
  }

  static fromApi(
    item: ApiUserAchievementItem,
    channelId: string,
    userId?: string,
  ): UserAchievement {
    if (item.typeAchievement == null) {
      throw new Error(
        "UserAchievement.fromApi requires item.typeAchievement to be set",
      );
    }
    const achieved =
      item.achieved ??
      (userId != null
        ? UserAchievement.defaultAchieved(item.id, userId)
        : (() => {
            throw new Error(
              "UserAchievement.fromApi requires item.achieved or userId when achieved is null",
            );
          })());
    return new UserAchievement(
      item.id,
      item.title,
      item.description,
      item.goal,
      item.reward,
      item.label,
      item.typeAchievement,
      achieved,
      channelId,
    );
  }

  static fromMerged(
    achievement: AchievementWithRequiredType,
    achieved: Achieved,
    channelId: string,
  ): UserAchievement {
    return new UserAchievement(
      achievement.id,
      achievement.title,
      achievement.description,
      achievement.goal,
      achievement.reward,
      achievement.label,
      achievement.typeAchievement,
      achieved,
      channelId,
    );
  }

  toCacheAchieved(): Achieved {
    return this.achieved;
  }
}
