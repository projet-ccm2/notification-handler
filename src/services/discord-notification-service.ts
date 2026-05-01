import { config } from "../config/environment";
import { logger } from "../utils/logger";

export class DiscordNotificationService {
  static async sendAchievementUnlocked(
    channelId: string,
    userLogin: string,
    achievementTitle: string,
  ): Promise<void> {
    const url = `${config.discordNotification.baseUrl}/notify`;
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
          context: "discord",
        });
      }
    } catch (error) {
      logger.error("Error sending Discord notification", {
        url,
        channelId,
        error: error instanceof Error ? error.message : String(error),
        context: "discord",
      });
    }
  }
}
