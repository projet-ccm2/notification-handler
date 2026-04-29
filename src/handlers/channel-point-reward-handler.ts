import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";
import { CacheDbService } from "../services/cache-db-service";
import {
  ChannelPointsCustomRewardPayload,
  ChannelPointsAutomaticRewardPayload,
} from "../types/payloads";

const COUNT_CHANNEL_POINT_REWARD_USE_TYPE = "countChannelPointReward";
const COUNT_CHANNEL_POINT_REWARD_COST_TYPE = "countChannelPointRewardCost";

export class ChannelPointRewardHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    const payload = event.payload as
      | ChannelPointsCustomRewardPayload
      | ChannelPointsAutomaticRewardPayload;
    logger.debug("Processing channel point reward event", {
      eventId: event.id,
      type: event.type,
      channel: event.channelLogin,
      userId: event.userId,
      userLogin: event.userLogin,
      context: "channel-points-handler",
    });

    const userId = event.userId;
    const channelId = event.channelId;
    if (!userId || !channelId) {
      logger.error("Missing userId or channelId", {
        eventId: event.id,
        channel: event.channelLogin,
        user: event.userLogin,
        context: "channel-points-handler",
      });
      return;
    }
    const ctx = {
      channelLogin: event.channelLogin,
      userLogin: event.userLogin,
    };
    if ("id" in payload.reward) {
      await this.handleCountChannelPointRewardUse(
        userId,
        channelId,
        payload.reward.id,
        ctx,
      );
    }
    await this.handleCountChannelPointRewardCost(
      userId,
      channelId,
      payload.reward.cost,
      ctx,
    );
  }

  static async handleCountChannelPointRewardUse(
    userId: string,
    channelId: string,
    idChannelPointReward: string,
    ctx: { channelLogin?: string; userLogin?: string } = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_CHANNEL_POINT_REWARD_USE_TYPE,
    );
    for (const ua of achievements) {
      if (ua.label === idChannelPointReward) {
        ua.achieved.count += 1;
        ua.achieved.finished = ua.achieved.count >= ua.goal;
        await CacheDbService.update(ua, ctx);
      }
    }
  }

  static async handleCountChannelPointRewardCost(
    userId: string,
    channelId: string,
    costChannelPointReward: number,
    ctx: { channelLogin?: string; userLogin?: string } = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_CHANNEL_POINT_REWARD_COST_TYPE,
    );
    for (const ua of achievements) {
      ua.achieved.count += costChannelPointReward;
      ua.achieved.finished = ua.achieved.count >= ua.goal;
      await CacheDbService.update(ua, ctx);
    }
  }
}
