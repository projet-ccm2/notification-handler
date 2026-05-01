import { config } from "../config/environment";
import {
  AchievementWithType,
  Badge,
  CachedUserAchievement,
  Possesses,
  User,
  UserAchievementsResponse,
} from "../types";
import { logger } from "../utils/logger";

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
  logger.debug("DB Gateway PUT request", { url, body, context: "db-gateway" });
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  logger.debug("DB Gateway PUT response", {
    url,
    status: response.status,
    body: responseText,
    context: "db-gateway",
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
    const filtered = raw.filter((a) => a.typeAchievement != null);
    logger.info("DB getAchievements", {
      channelId,
      rawCount: raw.length,
      filteredCount: filtered.length,
      rawTypeLabels: raw.map((a) => a.typeAchievement?.label ?? null),
      rawLabels: raw.map((a) => a.label),
      raw,
      context: "db-gateway",
    });
    return filtered;
  }

  static async getUserAchievements(
    userId: string,
    channelId: string,
  ): Promise<CachedUserAchievement[]> {
    const res = await fetchJson<UserAchievementsResponse>(
      `${config.dbGateway.baseUrl}/achievements/user/${userId}/channel/${channelId}`,
    );
    logger.info("DB getUserAchievements", {
      userId,
      channelId,
      count: res.achievements.length,
      typeLabels: res.achievements.map(
        (a) => a.typeAchievement?.label ?? null,
      ),
      labels: res.achievements.map((a) => a.label),
      achievements: res.achievements,
      context: "db-gateway",
    });
    return res.achievements;
  }

  static async getAchieved(
    achievementId: string,
    userId: string,
  ): Promise<object | null> {
    const params = new URLSearchParams({ achievementId, userId });
    return fetchJsonOrNull<object>(
      `${config.dbGateway.baseUrl}/achieved?${params}`,
    );
  }

  static async saveAchieved(body: {
    achievementId: string;
    userId: string;
    count: number;
    finished: boolean;
    labelActive: boolean;
    acquiredDate: string;
  }): Promise<void> {
    const existing = await this.getAchieved(body.achievementId, body.userId);
    if (existing) {
      await putJson(`${config.dbGateway.baseUrl}/achieved`, body);
    } else {
      await postJson(`${config.dbGateway.baseUrl}/achieved`, body);
    }
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
