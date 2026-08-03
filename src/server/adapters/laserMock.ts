/**
 * Mock LaserData adapter: models an Apache Iggy topic per run on top of the
 * in-memory event bus.
 *
 * The point of the mock is that it preserves Laser's *semantics*, not just
 * its method names — every record gets a monotonic offset, replay reads from
 * an offset rather than from a client-side array, and delivery is
 * at-least-once. Code written against this behaves identically when the live
 * adapter swaps in.
 */
import type { AgentEvent } from "@/contracts";
import {
  emitEvent,
  getRunEvents,
  publishEvent,
  subscribeToRun,
  type EventInput,
  type EventListener,
} from "@/server/events";
import type { ActivityRecord, AdapterInfo, LaserStreamAdapter, StreamedEvent } from "./types";

type LaserState = {
  /** Run topic -> partition count, mirroring ensureTopic(). */
  topics: Map<string, number>;
  /** Run topic -> activity records produced onto it. */
  activity: Map<string, ActivityRecord[]>;
};

const GLOBAL_KEY = "__atrium_laser_mock__";

function getState(): LaserState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      topics: new Map(),
      activity: new Map(),
    } satisfies LaserState;
  }
  return store[GLOBAL_KEY] as LaserState;
}

export function createMockLaserAdapter(): LaserStreamAdapter {
  const adapter: LaserStreamAdapter = {
    info(): AdapterInfo {
      return { name: "laser", mode: "mock", provider: "in-memory-log" };
    },

    async ensureTopic(runId: string, partitions = 4): Promise<void> {
      getState().topics.set(runId, partitions);
    },

    /**
     * Delivery is at-least-once, so the same envelope can legitimately arrive
     * more than once. The mock's log is the shared in-memory bus, which the
     * SSE route also reads — appending a duplicate there would replay the
     * event to the UI a second time and double-apply it to the world. Dedupe
     * on event_id, which is what any real consumer of this stream must do.
     */
    async publish(event: AgentEvent): Promise<void> {
      await adapter.ensureTopic(event.run_id);
      const seen = getRunEvents(event.run_id).some(
        (stored) => stored.event_id === event.event_id,
      );
      if (seen) {
        return;
      }
      publishEvent(event);
    },

    async emit(input: EventInput): Promise<AgentEvent> {
      await adapter.ensureTopic(input.run_id);
      return emitEvent(input);
    },

    async ingestActivity(activity: ActivityRecord): Promise<void> {
      await adapter.ensureTopic(activity.run_id);
      const state = getState();
      const records = state.activity.get(activity.run_id) ?? [];
      records.push(activity);
      state.activity.set(activity.run_id, records);
    },

    subscribe(runId: string, onEvent: EventListener): () => void {
      void adapter.ensureTopic(runId);
      return subscribeToRun(runId, onEvent);
    },

    /**
     * Offsets are the record's index in the run topic — the same contract the
     * live adapter gets from Iggy, so the UI scrubber does not change.
     */
    async replay(runId: string, fromOffset = 0n): Promise<StreamedEvent[]> {
      const events = getRunEvents(runId);
      const start = Number(fromOffset);
      return events
        .map((event, index) => ({ event, offset: BigInt(index) }))
        .filter((record) => Number(record.offset) >= start);
    },

    async latestOffset(runId: string): Promise<bigint> {
      const count = getRunEvents(runId).length;
      return count === 0 ? -1n : BigInt(count - 1);
    },

    async listTopics(): Promise<string[]> {
      return [...getState().topics.keys()].sort();
    },
  };

  return adapter;
}

/** Test/demo-reset helper. */
export function resetMockLaser(): void {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
}
