import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnvConfig, hasRequiredKeys, resetAdapterWarnings, resolveAdapterMode } from "./env";

const ENV_KEYS = [
  "SPONSOR_MODE",
  "FALKORDB_URL",
  "FALKORDB_PASSWORD",
  "FALKORDB_GRAPH",
  "LASER_CONNECTION_STRING",
  "LASER_STREAM",
  "ROCKETRIDE_APIKEY",
  "ROCKETRIDE_URI",
  "GUILD_API_KEY",
  "GUILD_LESSON_PLANNER_API_KEY",
  "GUILD_WORKSPACE",
];

describe("env config", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, "");
    }
    resetAdapterWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to mock mode with no sponsor credentials", () => {
    const config = getEnvConfig();
    expect(config.sponsorMode).toBe("mock");
    expect(config.falkordbUrl).toBeNull();
    expect(config.laserConnectionString).toBeNull();
    expect(config.rocketrideApiKey).toBeNull();
    expect(config.guildApiKey).toBeNull();
  });

  it("applies sensible defaults for graph, stream, and API host", () => {
    const config = getEnvConfig();
    expect(config.falkordbGraph).toBe("atrium");
    expect(config.laserStream).toBe("atrium");
    expect(config.rocketrideUri).toBe("https://api.rocketride.ai");
  });

  it("treats unknown SPONSOR_MODE values as mock", () => {
    vi.stubEnv("SPONSOR_MODE", "production");
    expect(getEnvConfig().sponsorMode).toBe("mock");
  });

  it("resolves every adapter to mock when SPONSOR_MODE=mock, even with keys", () => {
    vi.stubEnv("GUILD_API_KEY", "guild-key");
    vi.stubEnv("FALKORDB_URL", "redis://127.0.0.1:6379");
    expect(resolveAdapterMode("guild")).toBe("mock");
    expect(resolveAdapterMode("falkordb")).toBe("mock");
  });

  it("falls back to mock with a one-time warning when live mode lacks keys", () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(resolveAdapterMode("rocketride")).toBe("mock");
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // warning is one-time per adapter
    expect(resolveAdapterMode("rocketride")).toBe("mock");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("resolves each sponsor to live only when its own key is present", () => {
    vi.stubEnv("SPONSOR_MODE", "live");

    expect(hasRequiredKeys("falkordb")).toBe(false);
    vi.stubEnv("FALKORDB_URL", "redis://127.0.0.1:6379");
    expect(hasRequiredKeys("falkordb")).toBe(true);
    expect(resolveAdapterMode("falkordb")).toBe("live");

    vi.stubEnv("LASER_CONNECTION_STRING", "iggy:laser@127.0.0.1:8090");
    expect(resolveAdapterMode("laser")).toBe("live");

    vi.stubEnv("ROCKETRIDE_APIKEY", "rr-key");
    expect(resolveAdapterMode("rocketride")).toBe("live");
  });

  it("requires both gate credentials and the workspace before guild goes live", () => {
    vi.stubEnv("SPONSOR_MODE", "live");

    vi.stubEnv("GUILD_API_KEY", "id1:secret1");
    expect(hasRequiredKeys("guild")).toBe(false);

    vi.stubEnv("GUILD_LESSON_PLANNER_API_KEY", "id2:secret2");
    expect(hasRequiredKeys("guild")).toBe(false);

    vi.stubEnv("GUILD_WORKSPACE", "mem-in-motion/atrium");
    expect(hasRequiredKeys("guild")).toBe(true);
    expect(resolveAdapterMode("guild")).toBe("live");
  });

  it("degrades one layer at a time rather than the whole run", () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("FALKORDB_URL", "redis://127.0.0.1:6379");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Memory is live; the other three have no keys and quietly degrade.
    expect(resolveAdapterMode("falkordb")).toBe("live");
    expect(resolveAdapterMode("laser")).toBe("mock");
    expect(resolveAdapterMode("rocketride")).toBe("mock");
    expect(resolveAdapterMode("guild")).toBe("mock");
    warnSpy.mockRestore();
  });
});
