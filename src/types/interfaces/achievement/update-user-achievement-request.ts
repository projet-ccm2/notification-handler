export interface UpdateUserAchievementRequest {
  count: number;
  finished: boolean;
  labelActive: boolean;
  acquiredDate: string;
}

export interface SyncDataForAchievement extends UpdateUserAchievementRequest {
  rewardToAdd?: number;
}
