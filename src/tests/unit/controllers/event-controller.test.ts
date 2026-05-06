import { Request, Response } from "express";
import { EventController } from "../../../controllers/event-controller";

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../../handlers/event-handler", () => ({
  EventHandler: {
    handleEvent: jest.fn(),
  },
}));

const { EventHandler } = require("../../../handlers/event-handler");

describe("EventController", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    req = { body: undefined };
    res = { status: statusMock, json: jsonMock };
    jest.clearAllMocks();
  });

  it("returns 400 when body is not an array", async () => {
    req.body = {};
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid request body",
        message: "Expected an array of events",
      }),
    );
  });

  it("returns 400 when events array is empty", async () => {
    req.body = [];
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Events array cannot be empty",
      }),
    );
  });

  it("returns 500 for event missing required fields", async () => {
    req.body = [{ id: "e1", type: "message" }];
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partial",
        failed: 1,
        errors: expect.arrayContaining([
          expect.objectContaining({
            eventId: "e1",
            error: "Missing required fields: id, type, source, or timestamp",
          }),
        ]),
      }),
    );
  });

  it("returns error with eventId unknown when event has no id", async () => {
    req.body = [
      {
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
    ];
    await EventController.handleEvent(req as Request, res as Response);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            eventId: "unknown",
            error: "Missing required fields: id, type, source, or timestamp",
          }),
        ]),
      }),
    );
  });

  it("serializes non-Error throw as string in error response", async () => {
    req.body = [
      {
        id: "e1",
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
    ];
    (EventHandler.handleEvent as jest.Mock).mockRejectedValue(
      "plain string error",
    );
    await EventController.handleEvent(req as Request, res as Response);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partial",
        failed: 1,
        errors: expect.arrayContaining([
          expect.objectContaining({
            eventId: "e1",
            error: "plain string error",
          }),
        ]),
      }),
    );
  });

  it("returns 200 and success when all events processed", async () => {
    req.body = [
      {
        id: "e1",
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
    ];
    (EventHandler.handleEvent as jest.Mock).mockResolvedValue(undefined);
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        processed: 1,
        failed: 0,
        results: [{ eventId: "e1", status: "success" }],
      }),
    );
  });

  it("returns 207 when some events fail", async () => {
    req.body = [
      {
        id: "e1",
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
      {
        id: "e2",
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
    ];
    (EventHandler.handleEvent as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Handler error"));
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(207);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partial",
        processed: 1,
        failed: 1,
        errors: expect.arrayContaining([
          expect.objectContaining({
            eventId: "e2",
            error: "Handler error",
          }),
        ]),
      }),
    );
  });

  it("returns 500 when all events fail", async () => {
    req.body = [
      {
        id: "e1",
        type: "message",
        source: "twitch",
        timestamp: "2025-01-01T00:00:00Z",
        payload: {},
      },
    ];
    (EventHandler.handleEvent as jest.Mock).mockRejectedValue(
      new Error("Fail"),
    );
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "partial",
        failed: 1,
      }),
    );
  });

  it("returns 500 and internal server error when processing throws unexpectedly", async () => {
    req.body = [null];
    await EventController.handleEvent(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Internal server error",
        message: "Failed to process events",
      }),
    );
  });
});
