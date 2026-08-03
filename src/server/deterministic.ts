/**
 * Determinism helpers for the core loop.
 *
 * The demo must produce byte-identical output on every machine, so nothing in
 * this branch may call `Math.random()` or read the wall clock. IDs come from a
 * stable hash of the run input and timestamps come from a stepped clock
 * anchored to a fixed demo epoch.
 */

/** Fixed anchor for demo timestamps: 2025-03-03T08:00:00.000Z. */
export const DEMO_EPOCH_MS = Date.UTC(2025, 2, 3, 8, 0, 0, 0);

/** Milliseconds between consecutive deterministic timestamps. */
export const CLOCK_STEP_MS = 250;

/** FNV-1a, 32 bit. Small, stable, and dependency free. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Eight lowercase hex characters derived from `input`. */
export function hash8(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, "0");
}

/** Key-sorted JSON so hashing is insensitive to property order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** Monotonic, reproducible clock. One instance per run. */
export class DeterministicClock {
  private tick = 0;

  constructor(
    private readonly baseMs: number = DEMO_EPOCH_MS,
    private readonly stepMs: number = CLOCK_STEP_MS,
  ) {}

  /** Current timestamp without advancing. */
  peek(): string {
    return new Date(this.baseMs + this.tick * this.stepMs).toISOString();
  }

  /** Advance one step and return the new timestamp. */
  next(): string {
    const stamp = this.peek();
    this.tick += 1;
    return stamp;
  }

  get ticks(): number {
    return this.tick;
  }
}

/** Rounds to 4 decimals so float noise never leaks into snapshots. */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Clamps to [min, max]. */
export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
