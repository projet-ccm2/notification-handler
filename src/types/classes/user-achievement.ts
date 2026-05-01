import type {
  Achieved,
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
