# notification-handler

HTTP service that receives Twitch events (messages, channel points), processes them, and uses a Redis cache for achievements (definitions and achieved per user/channel). A DB gateway is used for persistence; the cache can be cleared per channel after a database update to avoid serving stale data.

## Stack

- **Node.js** + **TypeScript**
- **Express** (REST API)
- **Redis** (achievements/achieved cache, locks, pending sync)
- **Winston** (logging)

## Prerequisites

- Node.js (version supported by the project)
- Redis
- Access to the DB Gateway (achievements API)

## Installation

```bash
npm install
cp .env.example .env
# Edit .env for your environment
```

## Environment variables

| Variable          | Description                                                                                                                                   | Default                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `PORT`            | Server port                                                                                                                                   | `3000`                                        |
| `NODE_ENV`        | `development` / `integration` / `production` / `test`. Used as Redis key prefix for multi-env isolation when sharing a single Redis instance. | `development`                                 |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated)                                                                                                                | `http://localhost:3000,http://localhost:8080` |
| `DB_SERVICE_URL`  | DB service base URL (achievements)                                                                                                            | `http://localhost:8080`                       |
| `REDIS_URL`       | Redis URL                                                                                                                                     | `redis://localhost:6379`                      |
| `CACHE_TTL`       | Cache TTL in seconds                                                                                                                          | `3600`                                        |

When sharing a single Redis instance across environments (dev, int, prod), keys are prefixed by `NODE_ENV` (e.g. `development:achievements:ch1`) to avoid collisions.

## Scripts

| Command                 | Description                             |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Start the server in dev (`ts-node`)     |
| `npm run build`         | Compile TypeScript                      |
| `npm start`             | Start the server (after `build`)        |
| `npm test`              | Run tests and coverage                  |
| `npm run test:coverage` | Run tests with detailed coverage report |
| `npm run test:ci`       | Run tests in CI mode                    |

---

# API (Swagger-style)

Base URL: `http://localhost:3000` (or your deployment URL).

## Health

### GET /health

Service health check.

**Responses**

- **200 OK**

```json
{
  "status": "healthy",
  "timestamp": "2025-02-08T12:00:00.000Z",
  "environment": "development"
}
```

---

## Events

### POST /events

Submit a batch of Twitch events. Each event must have `id`, `type`, `source`, and `timestamp`. The body must be a non-empty array.

**Request**

- **Content-Type:** `application/json`
- **Body:** array of `TwitchEvent` objects

**TwitchEvent**

| Field          | Type   | Required | Description                                                                                                                            |
| -------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | string | yes      | Event identifier                                                                                                                       |
| `type`         | string | yes      | Type (e.g. `message`, `channel.channel_points_custom_reward_redemption.add`, `channel.channel_points_automatic_reward_redemption.add`) |
| `source`       | string | yes      | Event source                                                                                                                           |
| `timestamp`    | string | yes      | Date/time (e.g. ISO 8601)                                                                                                              |
| `version`      | string | no       | Payload version                                                                                                                        |
| `channelId`    | string | no       | Channel ID                                                                                                                             |
| `channelLogin` | string | no       | Channel login                                                                                                                          |
| `userId`       | string | no       | User ID                                                                                                                                |
| `userLogin`    | string | no       | User login                                                                                                                             |
| `payload`      | object | yes      | Payload per type (message, channel points, etc.)                                                                                       |

**Example body (message)**

```json
[
  {
    "id": "evt-1",
    "type": "message",
    "source": "twitch",
    "timestamp": "2025-02-08T12:00:00Z",
    "payload": {
      "message": "Hello",
      "raw": "Hello"
    }
  }
]
```

**Example body (channel points custom reward)**

```json
[
  {
    "id": "evt-2",
    "type": "channel.channel_points_custom_reward_redemption.add",
    "source": "twitch",
    "timestamp": "2025-02-08T12:00:00Z",
    "channelLogin": "mychannel",
    "userId": "user123",
    "userLogin": "viewer",
    "payload": {
      "id": "redemption-id",
      "broadcaster_user_id": "broadcaster-id",
      "broadcaster_user_name": "mychannel",
      "user_id": "user123",
      "user_login": "viewer",
      "user_name": "Viewer",
      "user_input": "",
      "status": "fulfilled",
      "redeemed_at": "2025-02-08T12:00:00Z",
      "reward": {
        "id": "reward-id",
        "title": "My Reward",
        "cost": 100,
        "prompt": "Description"
      }
    }
  }
]
```

**Responses**

- **200 OK** – All events processed successfully

```json
{
  "status": "success",
  "processed": 2,
  "failed": 0,
  "results": [
    { "eventId": "evt-1", "status": "success" },
    { "eventId": "evt-2", "status": "success" }
  ]
}
```

- **207 Multi-Status** – At least one success and at least one failure

```json
{
  "status": "partial",
  "processed": 1,
  "failed": 1,
  "results": [{ "eventId": "evt-1", "status": "success" }],
  "errors": [
    {
      "eventId": "evt-2",
      "error": "Error message"
    }
  ]
}
```

- **400 Bad Request** – Invalid body (not an array or empty array)

```json
{
  "error": "Invalid request body",
  "message": "Expected an array of events"
}
```

or

```json
{
  "error": "Invalid request body",
  "message": "Events array cannot be empty"
}
```

- **500 Internal Server Error** – All events failed or server error

```json
{
  "status": "partial",
  "processed": 0,
  "failed": 1,
  "results": [],
  "errors": [{ "eventId": "evt-1", "error": "..." }]
}
```

or

```json
{
  "error": "Internal server error",
  "message": "Failed to process events"
}
```

---

## Cache

### DELETE /cache/channel/:channelId

Clears all cache for a channel: channel achievement definitions and all users’ achieved lists for that channel. Call after a database update for that channel to avoid serving stale data.

**Path parameters**

| Name        | Type   | Description                                     |
| ----------- | ------ | ----------------------------------------------- |
| `channelId` | string | ID of the channel whose cache should be cleared |

**Responses**

- **204 No Content** – Cache cleared successfully (empty body)
- **400 Bad Request** – Missing `channelId`

```json
{
  "error": "Missing channelId",
  "message": "channelId is required"
}
```

- **500 Internal Server Error**

```json
{
  "error": "Internal server error",
  "message": "Failed to clear cache"
}
```

---

## Generic errors

- **404 Not Found** – Route or resource does not exist (default Express response for undefined routes).

---

## Logs & Filtering

### Logger

[Winston](https://github.com/winstonjs/winston) is used for structured JSON logging. The log level is `debug` when `NODE_ENV=development`, and `info` for all other environments.

All log entries carry:

- `service: "Notification-handler"` — always present (defaultMeta)
- `timestamp` — ISO 8601
- `context` — identifies the subsystem that emitted the log (see table below)

### Context taxonomy

| `context` value          | Subsystem                                                        |
| ------------------------ | ---------------------------------------------------------------- |
| `server`                 | Express startup, Redis connection, shutdown lifecycle            |
| `event-processing`       | Top-level event dispatch and unknown event handling              |
| `message-handler`        | Twitch chat message processing, count/content achievement checks |
| `channel-points-handler` | Channel point reward redemption processing                       |
| `achievement`            | Achievement completion detection, notification dispatch          |
| `cache-sync`             | Periodic cache-to-DB flush (`refreshExpiredCacheEntries`)        |
| `db-gateway`             | All HTTP calls to the DB gateway service                         |
| `redis`                  | Redis client lifecycle (connect, ready, errors)                  |
| `discord`                | Discord webhook notifications                                    |
| `twitch`                 | Twitch chat message delivery                                     |
| `badge`                  | Badge grant logic                                                |
| `cache-controller`       | Cache clear HTTP endpoint                                        |
| `event-controller`       | Event ingestion HTTP endpoint                                    |

### Sync architecture

When an achievement is updated, the new state is written to Redis with a TTL (default `CACHE_TTL` seconds) and the cache key is added to the `sync:pending` set. A `setInterval` running every `CACHE_SYNC_INTERVAL_MS` calls `refreshExpiredCacheEntries`. When a key's TTL has expired (or at shutdown with `force=true`), the pending sync data is flushed to the DB gateway and the key is removed from Redis. If a single key fails to flush, the error is logged with `context: "cache-sync"` and processing continues with the next pending key.

### Filtering examples

**GCP Cloud Logging** — filter in the query panel:

```
resource.type="cloud_run_revision"
jsonPayload.context="cache-sync"
```

```
resource.type="cloud_run_revision"
jsonPayload.context="discord" severity>=ERROR
```

**Locally with `jq`** (JSON logs piped from stdout):

```bash
# All errors from the cache-sync subsystem
node dist/index.js 2>&1 | jq 'select(.level == "error" and .context == "cache-sync")'

# All Discord logs
node dist/index.js 2>&1 | jq 'select(.context == "discord")'

# Achievement completions only
node dist/index.js 2>&1 | jq 'select(.context == "achievement")'
```
