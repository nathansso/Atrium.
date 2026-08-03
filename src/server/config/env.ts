/**
 * Environment configuration for the four mandated sponsor integrations.
 *
 * SPONSOR_MODE defaults to "mock" so the demo never depends on external
 * services. Even in "live" mode, any adapter whose keys are missing falls
 * back to its mock implementation with a one-time warning instead of
 * breaking the demo.
 *
 * Variable names deliberately match each vendor SDK's own convention so the
 * SDKs can read process.env directly when we hand off to them:
 *   - LASER_CONNECTION_STRING / LASER_STREAM  -> Laser.connectEnv()
 *   - ROCKETRIDE_APIKEY / ROCKETRIDE_URI      -> new RocketRideClient()
 */

export type SponsorMode = "mock" | "live";

/**
 * One adapter per mandated sponsor (memory, live data, motion, agents), plus
 * `firecrawl` — the source-grounded research provider that powers curriculum
 * authoring. Like RocketRide, Firecrawl has no local fallback service, so live
 * mode requires a key.
 */
export type AdapterName = "falkordb" | "laser" | "rocketride" | "guild" | "firecrawl";

export const adapterNames = [
  "falkordb",
  "laser",
  "rocketride",
  "guild",
  "firecrawl",
] as const satisfies readonly AdapterName[];

export type EnvConfig = {
  sponsorMode: SponsorMode;
  /** FalkorDB — memory layer. redis://host:port, optional password. */
  falkordbUrl: string | null;
  falkordbPassword: string | null;
  falkordbGraph: string;
  /** LaserData — live data layer. Bare user:password@host:port. */
  laserConnectionString: string | null;
  laserStream: string;
  /** RocketRide — motion layer. */
  rocketrideApiKey: string | null;
  rocketrideUri: string;
  /** Guild.ai — multi-agent layer. */
  guildApiKey: string | null;
  guildWorkspace: string | null;
  /** Firecrawl — source-grounded research layer. */
  firecrawlApiKey: string | null;
  firecrawlBaseUrl: string;
  firecrawlMaxResults: number;
};

function readOptional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getEnvConfig(): EnvConfig {
  const rawMode = process.env.SPONSOR_MODE?.trim().toLowerCase();
  return {
    sponsorMode: rawMode === "live" ? "live" : "mock",
    falkordbUrl: readOptional("FALKORDB_URL"),
    falkordbPassword: readOptional("FALKORDB_PASSWORD"),
    falkordbGraph: readOptional("FALKORDB_GRAPH") ?? "atrium",
    laserConnectionString: readOptional("LASER_CONNECTION_STRING"),
    laserStream: readOptional("LASER_STREAM") ?? "atrium",
    rocketrideApiKey: readOptional("ROCKETRIDE_APIKEY"),
    rocketrideUri: readOptional("ROCKETRIDE_URI") ?? "https://api.rocketride.ai",
    guildApiKey: readOptional("GUILD_API_KEY"),
    guildWorkspace: readOptional("GUILD_WORKSPACE"),
    firecrawlApiKey: readOptional("FIRECRAWL_API_KEY"),
    firecrawlBaseUrl: readOptional("FIRECRAWL_BASE_URL") ?? "https://api.firecrawl.dev/v1",
    firecrawlMaxResults: Number(readOptional("FIRECRAWL_MAX_RESULTS")) || 8,
  };
}

const keyRequirements: Record<AdapterName, (config: EnvConfig) => boolean> = {
  // FalkorDB and Laser both run locally in Docker, so a URL is all we need.
  falkordb: (config) => config.falkordbUrl !== null,
  laser: (config) => config.laserConnectionString !== null,
  // RocketRide is the one sponsor with no local fallback — it needs a key.
  rocketride: (config) => config.rocketrideApiKey !== null,
  guild: (config) => config.guildApiKey !== null,
  // Firecrawl, like RocketRide, is a hosted API with no local service.
  firecrawl: (config) => config.firecrawlApiKey !== null,
};

/** True when every credential the adapter needs for live mode is present. */
export function hasRequiredKeys(adapter: AdapterName, config: EnvConfig = getEnvConfig()): boolean {
  return keyRequirements[adapter](config);
}

const WARNED_KEY = "__atrium_adapter_warnings__";

function warnedSet(): Set<string> {
  const store = globalThis as Record<string, unknown>;
  if (!store[WARNED_KEY]) {
    store[WARNED_KEY] = new Set<string>();
  }
  return store[WARNED_KEY] as Set<string>;
}

/**
 * Resolve the effective mode for one adapter. Only returns "live" when
 * SPONSOR_MODE=live AND the adapter's keys are present; otherwise "mock",
 * warning once per adapter when live was requested but keys are missing.
 */
export function resolveAdapterMode(adapter: AdapterName, config: EnvConfig = getEnvConfig()): SponsorMode {
  if (config.sponsorMode !== "live") {
    return "mock";
  }
  if (hasRequiredKeys(adapter, config)) {
    return "live";
  }
  const warned = warnedSet();
  if (!warned.has(adapter)) {
    warned.add(adapter);
    console.warn(
      `[config] SPONSOR_MODE=live but required keys for "${adapter}" are missing; falling back to mock adapter.`,
    );
  }
  return "mock";
}

/** Test helper: allow fallback warnings to fire again. */
export function resetAdapterWarnings(): void {
  warnedSet().clear();
}
