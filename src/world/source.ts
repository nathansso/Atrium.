import { isAgentEvent, type AgentEvent } from "@/contracts";
import type { MockEvent } from "./mock/events";

export type EventSink = (event: AgentEvent) => void;

export type RunSource = {
  /** Begin delivering events to the sink. Safe to call once. */
  start: () => void;
  /** Stop delivering and release timers/connections. Safe to call repeatedly. */
  stop: () => void;
};

export type ReplayOptions = {
  /** 1 = authored pacing, 2 = twice as fast. */
  speed?: number;
  onComplete?: () => void;
};

/**
 * Mock event replay. Emits the frozen sequence on the authored delays using the
 * exact `AgentEvent` shape the SSE endpoint produces, so nothing downstream can
 * tell the difference between mock and live.
 */
export function createMockReplay(
  events: MockEvent[],
  sink: EventSink,
  options: ReplayOptions = {},
): RunSource {
  const speed = Math.max(0.1, options.speed ?? 1);
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    if (index >= events.length) {
      options.onComplete?.();
      return;
    }
    const event = events[index];
    timer = setTimeout(() => {
      if (stopped) return;
      index += 1;
      const { delay_ms: _delay, ...agentEvent } = event;
      void _delay;
      sink(agentEvent);
      scheduleNext();
    }, event.delay_ms / speed);
  };

  return {
    start: () => {
      if (stopped) return;
      scheduleNext();
    },
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

export type SseOptions = {
  onOpen?: () => void;
  onError?: (error: unknown) => void;
  /** Event types that mean the stream is finished and can be closed. */
  terminalEvents?: string[];
};

/**
 * Live SSE source for `GET /api/runs/:runId/events`.
 *
 * Accepts both named SSE events (`event: assignment.uploaded`) and unnamed
 * `message` frames, since the backend branch may emit either. Frames that are
 * not valid `AgentEvent`s are dropped rather than crashing the world.
 */
export function createSseSource(
  runId: string,
  sink: EventSink,
  options: SseOptions = {},
): RunSource {
  let source: EventSource | null = null;
  let stopped = false;

  const handle = (raw: MessageEvent<string>) => {
    if (stopped) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.data);
    } catch {
      return;
    }
    if (!isAgentEvent(parsed)) return;
    sink(parsed);
    if (options.terminalEvents?.includes(parsed.event_type)) {
      source?.close();
    }
  };

  return {
    start: () => {
      if (stopped || typeof EventSource === "undefined") return;
      source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
      source.onopen = () => options.onOpen?.();
      source.onmessage = handle;
      source.onerror = (error) => options.onError?.(error);
      // Named-event frames, in case the backend labels them by event_type.
      for (const type of NAMED_SSE_EVENTS) {
        source.addEventListener(type, handle as EventListener);
      }
    },
    stop: () => {
      stopped = true;
      source?.close();
      source = null;
    },
  };
}

const NAMED_SSE_EVENTS = [
  "assignment.uploaded",
  "assignment.concepts.extracted",
  "student.context.ready",
  "groups.proposed",
  "accessibility.layers.ready",
  "assignment.variants.ready",
  "submissions.received",
  "assessment.completed",
  "student.models.updated",
  "lesson.plan.ready",
  "approval.requested",
  "agent-event",
  "agent_event",
];
