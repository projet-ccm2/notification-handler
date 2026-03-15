import { config } from "../config/environment";
import {
  AchievementWithType,
  Badge,
  CachedUserAchievement,
  Possesses,
  User,
  UserAchievementsResponse,
} from "../types";

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
};

const fetchJsonOrNull = async <T>(url: string): Promise<T | null> => {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
};

const putJson = async (url: string, body: object): Promise<void> => {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
};

const postJson = async (url: string, body: object): Promise<void> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
};

export class DbService {
  static async getAchievements(
    channelId: string,
  ): Promise<AchievementWithType[]> {
    const raw = await fetchJson<AchievementWithType[]>(
      `${config.dbGateway.baseUrl}/achievements/channel/${channelId}`,
    );
    return raw.filter((a) => a.typeAchievement != null);
  }

  static async getUserAchievements(
    userId: string,
    channelId: string,
  ): Promise<CachedUserAchievement[]> {
    const res = await fetchJson<UserAchievementsResponse>(
      `${config.dbGateway.baseUrl}/achievements/user/${userId}/channel/${channelId}`,
    );
    return res.achievements;
  }

  static async putAchieved(body: {
    achievementId: string;
    userId: string;
    count: number;
    finished: boolean;
    labelActive: boolean;
    acquiredDate: string;
  }): Promise<void> {
    await putJson(`${config.dbGateway.baseUrl}/achieved`, body);
  }

  static async getUser(userId: string): Promise<User> {
    return fetchJson<User>(`${config.dbGateway.baseUrl}/users/${userId}`);
  }

  static async addExpToUser(userId: string, amount: number): Promise<void> {
    const user = await this.getUser(userId);
    const currentExp = user.exp ?? 0;
    await putJson(`${config.dbGateway.baseUrl}/users/${userId}`, {
      ...user,
      exp: currentExp + amount,
    });
  }

  static async getChannelBadge(channelId: string): Promise<Badge | null> {
    return fetchJsonOrNull<Badge>(
      `${config.dbGateway.baseUrl}/channels/${channelId}/badge`,
    );
  }

  static async getPossesses(
    userId: string,
    badgeId: string,
  ): Promise<Possesses | null> {
    const params = new URLSearchParams({ userId, badgeId });
    return fetchJsonOrNull<Possesses>(
      `${config.dbGateway.baseUrl}/possesses?${params}`,
    );
  }

  static async postPossesses(
    userId: string,
    badgeId: string,
    acquiredDate: string,
  ): Promise<void> {
    await postJson(`${config.dbGateway.baseUrl}/possesses`, {
      userId,
      badgeId,
      acquiredDate,
    });
  }
}
