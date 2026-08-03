import type { AgentEvent, AgentName, EventType, RunState } from "@/contracts";
import { createRun } from "@/server/coreLoop";
import { publishEvent, resetEventBus } from "@/server/events";
import { getRun as getStoredRun, putRun, resetRunStore, runClock } from "@/server/runStore";
import { DeterministicClock } from "@/server/deterministic";

/** Publish through Person D's event bus and mirror onto the run's event log. */
export function emitRunEvent(
  run: RunState,
  event_type: EventType,
  source_agent: AgentName,
  payload: Record<string, unknown>,
): AgentEvent {
  const event: AgentEvent = {
    event_id: `evt_${run.run_id}_${String(run.events.length + 1).padStart(3, "0")}`,
    event_type,
    run_id: run.run_id,
    source_agent,
    timestamp: runClock(run.run_id).next(),
    payload,
  };
  publishEvent(event);
  run.events.push(event);
  return event;
}

export function getRun(runId: string): RunState | undefined {
  return getStoredRun(runId) ?? undefined;
}

/** Fetch a run, bootstrapping through the real core loop if unknown. */
export async function getOrCreateRun(runId: string): Promise<RunState> {
  const existing = getStoredRun(runId);
  if (existing) return existing;

  const generated = (await createRun({ demo_mode: true })).state;
  resetEventBus(generated.run_id);
  const remapped: RunState = {
    ...generated,
    run_id: runId,
    events: generated.events.map((event) => ({
      ...event,
      run_id: runId,
      event_id: event.event_id.replace(generated.run_id, runId),
    })),
  };
  putRun(remapped, new DeterministicClock());
  for (const event of remapped.events) {
    publishEvent(event);
  }
  return remapped;
}

export function saveRun(run: RunState): void {
  putRun(run, new DeterministicClock());
}

/** Drop a run and its event history so the next access re-seeds cleanly. */
export function resetRun(runId: string): void {
  resetEventBus(runId);
  resetRunStore();
}
