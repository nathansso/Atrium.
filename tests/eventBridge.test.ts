import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "@/contracts";
import {
  clearEventBus,
  emitEvent,
  EVENT_BUS_GLOBAL_KEY,
  localEvents,
  registerEventBus,
  resetLocalEvents,
  resolveEventSink,
} from "@/server/eventBridge";
import { createRun } from "@/server/coreLoop";
import { resetRunStore } from "@/server/runStore";

type GlobalWithBus = typeof globalThis & {
  [EVENT_BUS_GLOBAL_KEY]?: { publish: (event: AgentEvent) => void };
};

describe("event bridge", () => {
  beforeEach(async () => {
    resetRunStore();
    resetLocalEvents();
    clearEventBus();
    delete (globalThis as GlobalWithBus)[EVENT_BUS_GLOBAL_KEY];
  });

  afterEach(async () => {
    clearEventBus();
    delete (globalThis as GlobalWithBus)[EVENT_BUS_GLOBAL_KEY];
  });

  it("falls back to the local collector when no bus is registered", async () => {
    expect(resolveEventSink()).toBeNull();
    const { state } = await createRun();
    expect(localEvents(state.run_id)).toHaveLength(6);
  });

  it("forwards to a bus registered by Person D", async () => {
    const received: AgentEvent[] = [];
    registerEventBus({ publish: (event) => received.push(event) });

    const { state } = await createRun();

    expect(received.map((e) => e.event_type)).toEqual(
      state.events.map((e) => e.event_type),
    );
    // The local mirror keeps working as an audit buffer.
    expect(localEvents(state.run_id)).toHaveLength(6);
  });

  it("picks up a bus published on the documented global slot", async () => {
    const received: AgentEvent[] = [];
    (globalThis as GlobalWithBus)[EVENT_BUS_GLOBAL_KEY] = {
      publish: (event) => received.push(event),
    };

    await createRun();
    expect(received).toHaveLength(6);
  });

  it("keeps the run alive when the bus throws", async () => {
    registerEventBus({
      publish: () => {
        throw new Error("bus offline");
      },
    });

    const { state } = await createRun();
    expect(state.status).toBe("variants_ready");
    expect(state.events).toHaveLength(6);
  });

  it("rejects an event that violates the contract", async () => {
    expect(() =>
      emitEvent({
        // @ts-expect-error deliberately invalid event type
        event_type: "not.a.real.event",
        run_id: "run_x",
        source_agent: "grouping_agent",
        timestamp: new Date(0).toISOString(),
        sequence: 1,
        payload: {},
      }),
    ).toThrow();
  });
});
