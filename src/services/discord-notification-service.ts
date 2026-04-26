import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class DiscordNotificationService {
  static async sendAchievementUnlocked(
    channelId: string,
    userLogin: string,
    achievementTitle: string,
  ): Promise<void> {
    try {
      const response = await fetch(
        `${config.discordNotification.baseUrl}/notify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId,
            title: "Achievement débloqué",
            text: `${userLogin} a débloqué : ${achievementTitle}`,
          }),
        },
      );
      if (!response.ok) {
        logger.error("Failed to send Discord notification", {
          channelId,
          status: response.status,
        });
      }
    } catch (error) {
      logger.error("Error sending Discord notification", {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
