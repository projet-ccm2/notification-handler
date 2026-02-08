import type { Achieved } from "./achieved";
import type { AchievementWithType } from "./achievement-with-type";

export interface CachedUserAchievement extends AchievementWithType {
  achieved: Achieved | null;
}

export type ApiUserAchievementItem = CachedUserAchievement;
