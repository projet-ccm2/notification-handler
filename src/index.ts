import express, { Request, Response } from "express";
import { config } from "./config/environment";
import { logger } from "./utils/logger";
import eventRoutes from "./routes/event-routes";
import { RedisService } from "./services";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

app.use("/", eventRoutes);

if (config.nodeEnv !== "test") {
  const server = app.listen(config.port, async () => {
    logger.info(`Server started on port ${config.port}`, {
      environment: config.nodeEnv,
      port: config.port,
    });

    try {
      await RedisService.connect();
      logger.info("Redis connected successfully");
    } catch (error) {
      logger.error("Failed to connect to Redis", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    try {
      await RedisService.disconnect();
      server.close(() => {
        logger.info("Server closed");
        process.exit(0);
      });
    } catch (error) {
      logger.error("Error during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export default app;
