import type { Achievement } from "./achievement";
import type { TypeAchievement } from "./type-achievement";

export interface AchievementWithType extends Achievement {
  typeAchievement: TypeAchievement | null;
}
