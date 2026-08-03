/**
 * In-memory event bus for agent events, keyed by run.
 *
 * Cached on globalThis so Next.js dev-server module reloads do not drop
 * event history or live subscribers.
 */
import type { AgentEvent, AgentName, EventType } from "@/contracts";

export type EventListener = (event: AgentEvent) => void;

type EventBusState = {
  history: Map<string, AgentEvent[]>;
  listeners: Map<string, Set<EventListener>>;
  counter: number;
};

const GLOBAL_KEY = "__atrium_event_bus__";

function getState(): EventBusState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      history: new Map(),
      listeners: new Map(),
      counter: 0,
    } satisfies EventBusState;
  }
  return store[GLOBAL_KEY] as EventBusState;
}

/** Append an event to run history and deliver it to live subscribers. */
export function publishEvent(event: AgentEvent): void {
  const state = getState();
  const events = state.history.get(event.run_id) ?? [];
  events.push(event);
  state.history.set(event.run_id, events);

  for (const listener of state.listeners.get(event.run_id) ?? []) {
    try {
      listener(event);
    } catch (error) {
      console.error("[event-bus] subscriber threw while handling event", event.event_id, error);
    }
  }
}

/** Subscribe to live events for a run. Returns an unsubscribe function. */
export function subscribeToRun(runId: string, onEvent: EventListener): () => void {
  const state = getState();
  let listeners = state.listeners.get(runId);
  if (!listeners) {
    listeners = new Set();
    state.listeners.set(runId, listeners);
  }
  listeners.add(onEvent);

  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0) {
      state.listeners.delete(runId);
    }
  };
}

/** All events published for a run so far, in publish order. */
export function getRunEvents(runId: string): AgentEvent[] {
  return [...(getState().history.get(runId) ?? [])];
}

/** Number of live subscribers for a run. */
export function getSubscriberCount(runId: string): number {
  return getState().listeners.get(runId)?.size ?? 0;
}

export type EventInput = {
  event_type: EventType;
  run_id: string;
  source_agent: AgentName;
  payload?: Record<string, unknown>;
};

/** Build a full AgentEvent envelope with a generated id and timestamp. */
export function createEvent(input: EventInput): AgentEvent {
  const state = getState();
  state.counter += 1;
  return {
    event_id: `evt_${String(state.counter).padStart(4, "0")}`,
    event_type: input.event_type,
    run_id: input.run_id,
    source_agent: input.source_agent,
    timestamp: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

/** Convenience: create and publish in one call. Returns the published event. */
export function emitEvent(input: EventInput): AgentEvent {
  const event = createEvent(input);
  publishEvent(event);
  return event;
}

/** Test/demo-reset helper. Clears one run, or everything when runId omitted. */
export function resetEventBus(runId?: string): void {
  const state = getState();
  if (runId) {
    state.history.delete(runId);
    state.listeners.delete(runId);
    return;
  }
  state.history.clear();
  state.listeners.clear();
  state.counter = 0;
}
