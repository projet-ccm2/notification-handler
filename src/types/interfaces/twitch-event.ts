import {
  MessagePayload,
  ChannelPointsCustomRewardPayload,
  ChannelPointsAutomaticRewardPayload,
} from "../payloads";

export interface TwitchEvent {
  id: string;
  timestamp: string;
  version: string;
  source: string;
  type: string;
  channelId?: string;
  channelLogin?: string;
  userId?: string;
  userLogin?: string;
  payload:
    | MessagePayload
    | ChannelPointsCustomRewardPayload
    | ChannelPointsAutomaticRewardPayload
    | Record<string, unknown>;
}
