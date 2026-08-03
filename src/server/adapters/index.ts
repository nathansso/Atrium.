/**
 * Adapter factory. Agents call getAdapters() and never construct a mock or
 * live implementation directly.
 *
 * Mode resolution is per adapter, not global: SPONSOR_MODE=mock (default)
 * always yields mocks; in live mode an adapter is only "live" when its keys
 * are present, otherwise it falls back to its mock with a one-time warning.
 * A missing key costs one layer, never the whole run — the property that
 * makes this demo-day safe.
 */
import {
  adapterNames,
  getEnvConfig,
  hasRequiredKeys,
  resolveAdapterMode,
  type AdapterName,
  type SponsorMode,
} from "@/server/config";
import { createLiveFalkorAdapter, closeLiveFalkor } from "./falkorLive";
import { createMockFalkorAdapter, resetMockFalkor } from "./falkorMock";
import { createLiveGuildAdapter, resetLiveGuild } from "./guildLive";
import { createMockGuildAdapter, resetMockGuild } from "./guildMock";
import { createLiveLaserAdapter, closeLiveLaser } from "./laserStream";
import { createMockLaserAdapter, resetMockLaser } from "./laserMock";
import { createLiveRocketRideAdapter, closeLiveRocketRide } from "./rocketrideLive";
import { createMockRocketRideAdapter, resetMockRocketRide } from "./rocketrideMock";
import { createLiveFirecrawlAdapter, closeLiveFirecrawl } from "./firecrawlLive";
import { createMockFirecrawlAdapter, resetMockFirecrawl } from "./firecrawlMock";
import type { SponsorAdapters } from "./types";

const GLOBAL_KEY = "__atrium_adapters__";

/**
 * Mode is resolved per adapter, so a missing key costs one layer rather than
 * the whole run. Guild's live adapter calls its Trigger REST API for the two
 * mandatory approval gates; agent registry and handoffs have no external
 * Guild endpoint, so both modes keep that bookkeeping local (see guildLive.ts).
 */
function buildAdapters(): SponsorAdapters {
  const isLive = (name: (typeof adapterNames)[number]) => resolveAdapterMode(name) === "live";

  return {
    falkordb: isLive("falkordb") ? createLiveFalkorAdapter() : createMockFalkorAdapter(),
    laser: isLive("laser") ? createLiveLaserAdapter() : createMockLaserAdapter(),
    rocketride: isLive("rocketride")
      ? createLiveRocketRideAdapter()
      : createMockRocketRideAdapter(),
    guild: isLive("guild") ? createLiveGuildAdapter() : createMockGuildAdapter(),
    firecrawl: isLive("firecrawl") ? createLiveFirecrawlAdapter() : createMockFirecrawlAdapter(),
  };
}

/** Singleton adapter bundle for the whole server process. */
export function getAdapters(): SponsorAdapters {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = buildAdapters();
  }
  return store[GLOBAL_KEY] as SponsorAdapters;
}

export type AdapterStatus = {
  name: AdapterName;
  requested_mode: SponsorMode;
  effective_mode: SponsorMode;
  keys_present: boolean;
};

/** Adapters that actually have a live implementation to switch to. */
const liveCapable: ReadonlySet<AdapterName> = new Set<AdapterName>([
  "falkordb",
  "laser",
  "rocketride",
  "firecrawl",
  "guild",
]);

/**
 * Effective status per adapter — powers /api/adapters/status and the UI badge.
 *
 * `effective_mode` reports what is actually running, so an adapter with keys
 * but no live implementation still reads "mock". The badge must never claim a
 * layer is live when it is not.
 */
export function getAdapterStatus(): AdapterStatus[] {
  const config = getEnvConfig();
  return adapterNames.map((name) => {
    const resolved = resolveAdapterMode(name, config);
    return {
      name,
      requested_mode: config.sponsorMode,
      effective_mode: liveCapable.has(name) ? resolved : "mock",
      keys_present: hasRequiredKeys(name, config),
    };
  });
}

/**
 * Test/demo-reset helper. Clears adapter singletons and mock state, and closes
 * any live connections so a reset does not leak sockets between runs.
 */
export async function resetAdapters(): Promise<void> {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
  resetMockFalkor();
  resetMockLaser();
  resetMockRocketRide();
  resetMockGuild();
  resetMockFirecrawl();
  resetLiveGuild();
  await Promise.all([
    closeLiveFalkor(),
    closeLiveLaser(),
    closeLiveRocketRide(),
    closeLiveFirecrawl(),
  ]);
}

export * from "./types";
