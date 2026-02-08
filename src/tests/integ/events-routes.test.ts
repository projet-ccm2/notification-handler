import request from "supertest";
import app from "../../index";

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../services/redis-service", () => ({
  RedisService: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../handlers/event-handler", () => ({
  EventHandler: {
    handleEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

const { EventHandler } = require("../../handlers/event-handler");

describe("POST /events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 and processes valid events", async () => {
    const response = await request(app)
      .post("/events")
      .send([
        {
          id: "evt1",
          type: "message",
          source: "twitch",
          timestamp: "2025-01-01T00:00:00Z",
          payload: { message: "hello" },
        },
      ])
      .set("Content-Type", "application/json");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.processed).toBe(1);
    expect(response.body.failed).toBe(0);
    expect(EventHandler.handleEvent).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when body is not an array", async () => {
    const response = await request(app)
      .post("/events")
      .send({ not: "array" })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request body");
  });

  it("returns 400 when array is empty", async () => {
    const response = await request(app)
      .post("/events")
      .send([])
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("empty");
  });
});
