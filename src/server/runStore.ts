import {
  runStateSchema,
  type AgentEvent,
  type RunState,
  type RunStatus,
} from "@/contracts";
import { DeterministicClock, hash8, stableStringify } from "./deterministic";

/**
 * In-memory run store.
 *
 * Held on `globalThis` so Next.js route handlers, dev-server hot reloads, and
 * tests all observe the same instance. A hackathon demo does not need
 * persistence; Person D can swap this for the Actian adapter behind the same
 * function surface.
 */

export type RunRecord = {
  state: RunState;
  clock: DeterministicClock;
  /** Monotonic event counter used for deterministic event IDs. */
  sequence: number;
};

type StoreState = {
  runs: Map<string, RunRecord>;
  /** Number of runs created, used to disambiguate identical inputs. */
  createdCount: number;
};

const STORE_KEY = Symbol.for("atrium.runStore");

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: StoreState };

function store(): StoreState {
  const g = globalThis as GlobalWithStore;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { runs: new Map(), createdCount: 0 };
  }
  return g[STORE_KEY];
}

/**
 * Deterministic run ID: same input against a fresh store always yields the
 * same value. The sequence suffix only exists so repeated identical requests
 * do not collide inside one process.
 */
export function nextRunId(canonicalInput: unknown): string {
  const s = store();
  s.createdCount += 1;
  return `run_${hash8(stableStringify(canonicalInput))}_${String(s.createdCount).padStart(2, "0")}`;
}

export function putRun(state: RunState, clock: DeterministicClock): RunRecord {
  const record: RunRecord = {
    state: runStateSchema.parse(state),
    clock,
    sequence: state.events.length,
  };
  store().runs.set(state.run_id, record);
  return record;
}

export function getRunRecord(runId: string): RunRecord | null {
  return store().runs.get(runId) ?? null;
}

export function getRun(runId: string): RunState | null {
  return getRunRecord(runId)?.state ?? null;
}

export function listRuns(): RunState[] {
  return [...store().runs.values()].map((r) => r.state);
}

export function updateRun(
  runId: string,
  mutate: (state: RunState) => RunState,
): RunState {
  const record = store().runs.get(runId);
  if (!record) {
    throw new Error(`Unknown run: ${runId}`);
  }
  record.state = mutate(record.state);
  return record.state;
}

export function setRunStatus(runId: string, status: RunStatus): RunState {
  return updateRun(runId, (state) => ({ ...state, status }));
}

export function appendRunEvent(runId: string, event: AgentEvent): RunState {
  const record = store().runs.get(runId);
  if (!record) {
    throw new Error(`Unknown run: ${runId}`);
  }
  record.sequence += 1;
  record.state = { ...record.state, events: [...record.state.events, event] };
  return record.state;
}

/** Next deterministic event sequence number for a run. */
export function nextEventSequence(runId: string): number {
  const record = store().runs.get(runId);
  if (!record) {
    throw new Error(`Unknown run: ${runId}`);
  }
  return record.sequence + 1;
}

export function runClock(runId: string): DeterministicClock {
  const record = store().runs.get(runId);
  if (!record) {
    throw new Error(`Unknown run: ${runId}`);
  }
  return record.clock;
}

/** Finds the most recently created run that contains a given room. */
export function findLatestRunWithRoom(roomId: string): RunState | null {
  const runs = listRuns().filter((run) =>
    run.rooms.some((room) => room.room_id === roomId),
  );
  return runs.length > 0 ? runs[runs.length - 1] : null;
}

/** Finds the most recently created run that contains a given student. */
export function findLatestRunWithStudent(studentId: string): RunState | null {
  const runs = listRuns().filter((run) =>
    run.students.some((student) => student.student_id === studentId),
  );
  return runs.length > 0 ? runs[runs.length - 1] : null;
}

/** Test-only reset. Never called from route handlers. */
export function resetRunStore(): void {
  const g = globalThis as GlobalWithStore;
  g[STORE_KEY] = { runs: new Map(), createdCount: 0 };
}
