import request from "supertest";
import app from "../../index";
import { config } from "../../config/environment";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Express App", () => {
  describe("GET /health", () => {
    it("should return health status with correct structure", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("environment", config.nodeEnv);
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it("should return a valid ISO timestamp", async () => {
      const response = await request(app).get("/health");
      const timestamp = new Date(response.body.timestamp);

      expect(timestamp.toISOString()).toBe(response.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe("Server configuration", () => {
    it("should have x-powered-by header disabled", () => {
      expect(app.get("x-powered-by")).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should handle unknown routes with 404", async () => {
      const response = await request(app).get("/unknown-route");
      expect(response.status).toBe(404);
    });
  });
});
