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
    const raw = event.payload as
      | { event?: unknown }
      | ChannelPointsCustomRewardPayload
      | ChannelPointsAutomaticRewardPayload;
    const payload = (
      raw && typeof raw === "object" && "event" in raw && raw.event
        ? (raw as { event: unknown }).event
        : raw
    ) as ChannelPointsCustomRewardPayload | ChannelPointsAutomaticRewardPayload;
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
    if (!payload.reward) {
      logger.warn("Missing reward in payload", {
        eventId: event.id,
        type: event.type,
        payloadKeys: Object.keys((event.payload as object) ?? {}),
        channel: event.channelLogin,
        user: event.userLogin,
        context: "channel-points-handler",
      });
      return;
    }
    logger.info("Channel point reward parsed", {
      eventId: event.id,
      type: event.type,
      rewardId: "id" in payload.reward ? payload.reward.id : undefined,
      rewardCost: payload.reward.cost,
      userId,
      channelId,
      context: "channel-points-handler",
    });
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
    logger.info("Channel point USE achievements fetched", {
      userId,
      channelId,
      idChannelPointReward,
      count: achievements.length,
      labels: achievements.map((a) => a.label),
      context: "channel-points-handler",
    });
    let matched = 0;
    for (const ua of achievements) {
      if (ua.label === idChannelPointReward) {
        ua.achieved.count += 1;
        ua.achieved.finished = ua.achieved.count >= ua.goal;
        await CacheDbService.update(ua, ctx);
        matched++;
      }
    }
    if (matched === 0) {
      logger.warn("No USE achievement matched reward id", {
        userId,
        channelId,
        idChannelPointReward,
        context: "channel-points-handler",
      });
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
    logger.info("Channel point COST achievements fetched", {
      userId,
      channelId,
      costChannelPointReward,
      count: achievements.length,
      context: "channel-points-handler",
    });
    for (const ua of achievements) {
      ua.achieved.count += costChannelPointReward;
      ua.achieved.finished = ua.achieved.count >= ua.goal;
      await CacheDbService.update(ua, ctx);
    }
  }
}
