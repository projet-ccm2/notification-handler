import type {
  Achieved,
  ApiUserAchievementItem,
  AchievementWithType,
  TypeAchievement,
} from "../interfaces/achievement";

export class UserAchievement {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly description: string,
    public readonly goal: number,
    public readonly reward: number,
    public readonly label: string,
    public readonly typeAchievement: TypeAchievement | null,
    public readonly achieved: Achieved | null,
    public readonly channelId: string
  ) {}

  static fromApi(item: ApiUserAchievementItem, channelId: string): UserAchievement {
    return new UserAchievement(
      item.id,
      item.title,
      item.description,
      item.goal,
      item.reward,
      item.label,
      item.typeAchievement,
      item.achieved,
      channelId
    );
  }

  static fromMerged(
    achievement: AchievementWithType,
    achieved: Achieved | null,
    channelId: string
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
      channelId
    );
  }

  toCacheAchieved(): Achieved {
    if (!this.achieved) {
      throw new Error("UserAchievement.toCacheAchieved requires achieved to be set");
    }
    return this.achieved;
  }
}
