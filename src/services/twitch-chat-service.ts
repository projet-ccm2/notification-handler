import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class TwitchChatService {
  static async sendAchievementUnlocked(
    channelLogin: string,
    userLogin: string,
    achievementTitle: string,
  ): Promise<void> {
    const message = `@${userLogin} a débloqué l'achievement "${achievementTitle}" !`;
    await this.sendMessage(channelLogin, message);
  }

  static async sendBadgeGranted(
    channelLogin: string,
    userLogin: string,
  ): Promise<void> {
    const message = `@${userLogin} a débloqué tous les achievements et obtenu le badge du channel !`;
    await this.sendMessage(channelLogin, message);
  }

  private static async sendMessage(
    channelLogin: string,
    message: string,
  ): Promise<void> {
    const url = `${config.twitchListener.baseUrl}/chat/message`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.twitchListener.apiKey,
        },
        body: JSON.stringify({ channelLogin, message }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.error("Failed to send Twitch chat message", {
          url,
          channelLogin,
          status: response.status,
          responseBody: body,
          context: "twitch",
        });
      }
    } catch (error) {
      logger.error("Error sending Twitch chat message", {
        url,
        channelLogin,
        error: error instanceof Error ? error.message : String(error),
        context: "twitch",
      });
    }
  }
}
