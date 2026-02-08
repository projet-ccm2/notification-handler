export interface ChannelPointsAutomaticRewardPayload {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_name: string;
  user_id: string;
  user_login: string;
  user_name: string;
  user_input: string;
  redeemed_at: string;
  reward: {
    type: string;
    cost: number;
    unlocked_emote: string | null;
  };
  message: {
    text: string;
    emotes: any[];
  };
}
