import { config } from "../config/environment";
import { Achievement, UserAchievement, UpdateUserAchievementRequest } from "../types";

const fetchJson = async (url: string): Promise<any> => {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
};

const postJson = async (url: string, body: any): Promise<void> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
};

export class DbService {
  static async getAchievements(channelId: string): Promise<Achievement[]> {
    return fetchJson(`${config.dbGateway.baseUrl}/achievements/${channelId}`);
  }

  static async getUserAchievements(userId: string, channelId: string): Promise<UserAchievement[]> {
    return fetchJson(`${config.dbGateway.baseUrl}/achievements/user/${userId}/channel/${channelId}`);
  }

  static async updateUserAchievement(
    userId: string,
    achievementId: string,
    data: UpdateUserAchievementRequest
  ): Promise<void> {
    await postJson(
      `${config.dbGateway.baseUrl}/users/${userId}/achievements/${achievementId}`,
      data
    );
  }
}
