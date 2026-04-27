import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class DiscordNotificationService {
  static async sendAchievementUnlocked(
    channelId: string,
    userLogin: string,
    achievementTitle: string,
  ): Promise<void> {
    const url = `${config.discordNotification.baseUrl}/notify`;
    logger.debug("Sending Discord achievement notification", {
      url,
      channelId,
      userLogin,
      achievementTitle,
    });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          title: "Achievement débloqué",
          text: `${userLogin} a débloqué : ${achievementTitle}`,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.error("Failed to send Discord notification", {
          url,
          channelId,
          status: response.status,
          responseBody: body,
        });
      } else {
        logger.debug("Discord notification sent successfully", {
          channelId,
          status: response.status,
        });
      }
    } catch (error) {
      logger.error("Error sending Discord notification", {
        url,
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
