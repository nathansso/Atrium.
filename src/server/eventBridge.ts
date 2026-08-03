import {
  agentEventSchema,
  type AgentEvent,
  type AgentName,
  type EventType,
} from "@/contracts";
import { publishEvent } from "@/server/events";

/**
 * Event transport seam.
 *
 * Person D owns the real event bus in `src/server/events`. Until that branch is
 * merged this module keeps a local in-memory collector so the core loop is
 * fully testable and demoable on its own.
 *
 * Integration contract for Person D: call `registerEventBus(sink)` once at
 * module init, or assign a sink to `globalThis[EVENT_BUS_GLOBAL_KEY]`. Either
 * way every core-loop event is forwarded, and the local mirror keeps working as
 * a replay/audit buffer.
 */

export type EventSink = {
  publish: (event: AgentEvent) => void;
};

/** Documented global slot so no cross-branch import is required. */
export const EVENT_BUS_GLOBAL_KEY = Symbol.for("atrium.eventBus");

type BridgeState = {
  sink: EventSink | null;
  local: AgentEvent[];
};

const BRIDGE_STATE_KEY = Symbol.for("atrium.eventBridge.state");

type GlobalWithBridge = typeof globalThis & {
  [BRIDGE_STATE_KEY]?: BridgeState;
  [EVENT_BUS_GLOBAL_KEY]?: EventSink;
};

function state(): BridgeState {
  const g = globalThis as GlobalWithBridge;
  if (!g[BRIDGE_STATE_KEY]) {
    g[BRIDGE_STATE_KEY] = { sink: null, local: [] };
  }
  return g[BRIDGE_STATE_KEY];
}

function isEventSink(value: unknown): value is EventSink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EventSink).publish === "function"
  );
}

/** Resolves the bus Person D registered, or null when running standalone. */
export function resolveEventSink(): EventSink | null {
  const explicit = state().sink;
  if (explicit) return explicit;
  const ambient = (globalThis as GlobalWithBridge)[EVENT_BUS_GLOBAL_KEY];
  return isEventSink(ambient) ? ambient : null;
}

export function registerEventBus(sink: EventSink): void {
  state().sink = sink;
}

export function clearEventBus(): void {
  state().sink = null;
}

export type EmitEventInput = {
  event_type: EventType;
  run_id: string;
  source_agent: AgentName;
  timestamp: string;
  sequence: number;
  payload: Record<string, unknown>;
};

/**
 * Validates, forwards, and mirrors one event.
 *
 * A failing sink must never break the run: the local mirror is still written
 * and the event is still returned so it lands in `RunState.events`.
 */
export function emitEvent(input: EmitEventInput): AgentEvent {
  const event = agentEventSchema.parse({
    event_id: `evt_${input.run_id}_${String(input.sequence).padStart(3, "0")}`,
    event_type: input.event_type,
    run_id: input.run_id,
    source_agent: input.source_agent,
    timestamp: input.timestamp,
    payload: input.payload,
  });

  state().local.push(event);

  const sink = resolveEventSink();
  if (sink) {
    try {
      sink.publish(event);
    } catch {
      // Local mirror is the fallback of record; the run continues.
    }
  } else {
    publishEvent(event);
  }

  return event;
}

export function localEvents(runId?: string): AgentEvent[] {
  const all = state().local;
  return runId ? all.filter((e) => e.run_id === runId) : [...all];
}

export function resetLocalEvents(): void {
  state().local = [];
}
