export interface Achievement {
  id: string;
  title: string;
  description: string;
  goal: number;
  reward: number;
  label: string;
}

export interface UserAchievement {
  achievementId: string;
  userId: string;
  count: number;
  finished: boolean;
  labelActive: boolean;
  acquiredDate: string;
}

export interface UpdateUserAchievementRequest {
  count: number;
  finished: boolean;
  labelActive: boolean;
  acquiredDate: string;
}
