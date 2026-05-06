import type { CachedUserAchievement } from "./cached-user-achievement";

export interface UserAchievementsResponse {
  userId: string;
  channelId: string;
  achievements: CachedUserAchievement[];
}
