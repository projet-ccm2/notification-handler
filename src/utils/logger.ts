import winston from "winston";

const LEVEL_TO_GCP_SEVERITY: Record<string, string> = {
  error: "ERROR",
  warn: "WARNING",
  info: "INFO",
  http: "INFO",
  verbose: "DEBUG",
  debug: "DEBUG",
  silly: "DEBUG",
};

const gcpSeverity = winston.format((info) => {
  info.severity = LEVEL_TO_GCP_SEVERITY[info.level] ?? "DEFAULT";
  if (info.message instanceof Error) {
    info.stack_trace = info.message.stack;
    info.message = info.message.message;
  }
  return info;
});

const isDev = process.env.NODE_ENV === "development";

const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    gcpSeverity(),
    winston.format.json(),
  ),
  defaultMeta: { service: "Notification-handler" },
  transports: [
    new winston.transports.Console({
      format: isDev
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          )
        : undefined,
    }),
  ],
});

export { logger };
