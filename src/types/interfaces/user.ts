export interface User {
  id: string;
  username: string;
  profileImageUrl: string | null;
  channelDescription: string | null;
  scope: string | null;
  lastUpdateTimestamp: string;
  exp?: number;
}
