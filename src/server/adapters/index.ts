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
import { createMockGuildAdapter, resetMockGuild } from "./guildMock";
import { createLiveLaserAdapter, closeLiveLaser } from "./laserStream";
import { createMockLaserAdapter, resetMockLaser } from "./laserMock";
import { createLiveRocketRideAdapter, closeLiveRocketRide } from "./rocketrideLive";
import { createMockRocketRideAdapter, resetMockRocketRide } from "./rocketrideMock";
import type { SponsorAdapters } from "./types";

const GLOBAL_KEY = "__atrium_adapters__";

/**
 * Mode is resolved per adapter, so a missing key costs one layer rather than
 * the whole run. Guild has no live implementation yet — its SDK ships from a
 * private registry — so it resolves to mock even when a key is present, and
 * says so rather than silently pretending.
 */
function buildAdapters(): SponsorAdapters {
  const isLive = (name: (typeof adapterNames)[number]) => resolveAdapterMode(name) === "live";

  if (resolveAdapterMode("guild") === "live") {
    console.warn(
      '[adapters] guild has no live implementation yet (@guildai/agents-sdk is not on public npm); using the mock.',
    );
  }

  return {
    falkordb: isLive("falkordb") ? createLiveFalkorAdapter() : createMockFalkorAdapter(),
    laser: isLive("laser") ? createLiveLaserAdapter() : createMockLaserAdapter(),
    rocketride: isLive("rocketride")
      ? createLiveRocketRideAdapter()
      : createMockRocketRideAdapter(),
    guild: createMockGuildAdapter(),
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
  await Promise.all([closeLiveFalkor(), closeLiveLaser(), closeLiveRocketRide()]);
}

export * from "./types";
