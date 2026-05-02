interface Config {
  port: number;
  nodeEnv: string;
  cors: {
    allowedOrigins: string[];
  };
  dbGateway: {
    baseUrl: string;
  };
  redis: {
    url: string;
  };
  cache: {
    ttl: number;
    syncIntervalMs: number;
  };
  twitchListener: {
    baseUrl: string;
    apiKey: string;
  };
  discordNotification: {
    baseUrl: string;
  };
  userExistenceCache: {
    ttlMs: number;
  };
}

function validateConfig(): Config {
  return {
    port: Number.parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    cors: {
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["http://localhost:3000", "http://localhost:8080", "null"],
    },
    dbGateway: {
      baseUrl: process.env.DB_SERVICE_URL || "http://localhost:8080",
    },
    redis: {
      url: process.env.REDIS_URL || "redis://localhost:6379",
    },
    cache: {
      ttl: Number.parseInt(process.env.CACHE_TTL || "3600", 10),
      syncIntervalMs: Number.parseInt(
        process.env.CACHE_SYNC_INTERVAL_MS || "300",
        10,
      ),
    },
    twitchListener: {
      baseUrl: process.env.TWITCH_LISTENER_URL || "http://localhost:3000",
      apiKey: process.env.CHAT_API_KEY || "",
    },
    discordNotification: {
      baseUrl: process.env.DISCORD_NOTIF_URL || "http://localhost:3001",
    },
    userExistenceCache: {
      ttlMs: Number.parseInt(
        process.env.USER_EXISTENCE_CACHE_TTL_MS || "60000",
        10,
      ),
    },
  };
}

export const config = validateConfig();
