import express, { Request, Response } from "express";
import { config } from "./config/environment";
import { logger } from "./utils/logger";
import eventRoutes from "./routes/event-routes";

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
  const server = app.listen(config.port, () => {
    logger.info(`Server started on port ${config.port}`, {
      environment: config.nodeEnv,
      port: config.port,
    });
  });
}

export default app;
