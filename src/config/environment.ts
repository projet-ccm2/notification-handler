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
      baseUrl: process.env.DB_GATEWAY_BASE_URL || "http://localhost:8080",
    },
    redis: {
      url: process.env.REDIS_URL || "redis://localhost:6379",
    },
    cache: {
      ttl: Number.parseInt(process.env.CACHE_TTL || "3600", 10),
    },
  };
}

export const config = validateConfig();
