import express, { Request, Response } from "express";
import { config } from "./config/environment";
import { logger } from "./utils/logger";
import eventRoutes from "./routes/event-routes";
import cacheRoutes from "./routes/cache-routes";
import { RedisService } from "./services";
import { CacheDbService } from "./services/cache-db-service";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100mb" }));

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

app.use("/", eventRoutes);
app.use("/cache", cacheRoutes);

if (config.nodeEnv !== "test") {
  const server = app.listen(config.port, async () => {
    logger.info(`Server started on port ${config.port}`, {
      environment: config.nodeEnv,
      port: config.port,
      context: "server",
    });

    try {
      await RedisService.connect();
      logger.info("Redis connected successfully", { context: "server" });
    } catch (error) {
      logger.error("Failed to connect to Redis", {
        error: error instanceof Error ? error.message : String(error),
        context: "server",
      });
    }
  });

  const syncInterval = setInterval(async () => {
    try {
      await CacheDbService.refreshExpiredCacheEntries();
    } catch (error) {
      logger.error("Failed to refresh expired cache entries", {
        error: error instanceof Error ? error.message : String(error),
        context: "server",
      });
    }
  }, config.cache.syncIntervalMs);

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`, {
      context: "server",
    });
    clearInterval(syncInterval);
    try {
      logger.debug("Flushing pending sync data before shutdown", {
        context: "server",
      });
      await CacheDbService.refreshExpiredCacheEntries(true);
      logger.debug("Flush complete, disconnecting Redis", {
        context: "server",
      });
      await RedisService.disconnect();
      server.close(() => {
        logger.info("Server closed", { context: "server" });
        process.exit(0);
      });
    } catch (error) {
      logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
        context: "server",
      });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export default app;
