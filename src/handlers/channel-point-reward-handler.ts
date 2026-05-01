import { TwitchEvent } from "../types";
import { logger } from "../utils/logger";
import { CacheDbService, EventCtx } from "../services/cache-db-service";
import { UserExistenceCache } from "../services/user-existence-cache";
import {
  ChannelPointsCustomRewardPayload,
  ChannelPointsAutomaticRewardPayload,
} from "../types/payloads";

const COUNT_CHANNEL_POINT_REWARD_USE_TYPE = "countRedeemChannelPoint";
const COUNT_CHANNEL_POINT_REWARD_COST_TYPE = "countCostChannelPoint";

export class ChannelPointRewardHandler {
  static async handle(event: TwitchEvent): Promise<void> {
    const raw = event.payload as
      | { event?: unknown }
      | ChannelPointsCustomRewardPayload
      | ChannelPointsAutomaticRewardPayload;
    const payload = (
      raw && typeof raw === "object" && "event" in raw && raw.event
        ? (raw as { event: unknown }).event
        : raw
    ) as ChannelPointsCustomRewardPayload | ChannelPointsAutomaticRewardPayload;

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
    if (!(await UserExistenceCache.exists(userId))) {
      logger.warn("Skipping event: user not in DB", {
        eventId: event.id,
        channel: event.channelLogin,
        user: event.userLogin,
        userId,
        context: "channel-points-handler",
      });
      return;
    }
    const ctx = {
      channelLogin: event.channelLogin,
      userLogin: event.userLogin,
    };
    if (!payload.reward) {
      logger.warn("Missing reward in payload", {
        eventId: event.id,
        type: event.type,
        channel: event.channelLogin,
        user: event.userLogin,
        context: "channel-points-handler",
      });
      return;
    }
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
    ctx: EventCtx = {},
  ): Promise<void> {
    const achievements = await CacheDbService.getAchievements(
      channelId,
      userId,
      COUNT_CHANNEL_POINT_REWARD_USE_TYPE,
    );
    for (const ua of achievements) {
      if (ua.typeAchievement.data === idChannelPointReward) {
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
    ctx: EventCtx = {},
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
