import { UserExistenceCache } from "../../../services/user-existence-cache";
import { DbService } from "../../../services/db-service";

jest.mock("../../../services/db-service", () => ({
  DbService: { userExists: jest.fn() },
}));

jest.mock("../../../config/environment", () => ({
  config: { userExistenceCache: { ttlMs: 60000 } },
}));

describe("UserExistenceCache", () => {
  beforeEach(() => {
    UserExistenceCache.clear();
    jest.clearAllMocks();
  });

  it("calls DbService on miss and caches the result", async () => {
    jest.mocked(DbService.userExists).mockResolvedValue(true);

    const a = await UserExistenceCache.exists("u1");
    const b = await UserExistenceCache.exists("u1");

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(DbService.userExists).toHaveBeenCalledTimes(1);
  });

  it("caches false results too", async () => {
    jest.mocked(DbService.userExists).mockResolvedValue(false);

    const a = await UserExistenceCache.exists("u1");
    const b = await UserExistenceCache.exists("u1");

    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(DbService.userExists).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    jest.mocked(DbService.userExists).mockResolvedValue(true);

    await UserExistenceCache.exists("u1");
    jest.setSystemTime(new Date("2026-01-01T00:01:01Z")); // +61s
    await UserExistenceCache.exists("u1");

    expect(DbService.userExists).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("invalidate forces a refetch", async () => {
    jest.mocked(DbService.userExists).mockResolvedValue(true);

    await UserExistenceCache.exists("u1");
    UserExistenceCache.invalidate("u1");
    await UserExistenceCache.exists("u1");

    expect(DbService.userExists).toHaveBeenCalledTimes(2);
  });

  it("clear empties the cache", async () => {
    jest.mocked(DbService.userExists).mockResolvedValue(true);

    await UserExistenceCache.exists("u1");
    await UserExistenceCache.exists("u2");
    UserExistenceCache.clear();
    await UserExistenceCache.exists("u1");

    expect(DbService.userExists).toHaveBeenCalledTimes(3);
  });
});
