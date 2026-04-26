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
    try {
      const response = await fetch(
        `${config.twitchListener.baseUrl}/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.twitchListener.apiKey,
          },
          body: JSON.stringify({ channelLogin, message }),
        },
      );
      if (!response.ok) {
        logger.error("Failed to send Twitch chat message", {
          channelLogin,
          status: response.status,
        });
      }
    } catch (error) {
      logger.error("Error sending Twitch chat message", {
        channelLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
