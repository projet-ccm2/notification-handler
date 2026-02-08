export interface ChannelPointsCustomRewardPayload {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_name: string;
  user_id: string;
  user_login: string;
  user_name: string;
  user_input: string;
  status: string;
  redeemed_at: string;
  reward: {
    id: string;
    title: string;
    cost: number;
    prompt: string;
  };
}
