/**
 * Agent audit log: who did what, with which evidence, and whether the action
 * opened a human review gate. In-memory, cached on globalThis so Next.js dev
 * reloads keep the trail.
 */
import type { AgentName } from "@/contracts";

export type AuditActor = AgentName | "system" | "professor";

export type AuditEntry = {
  audit_id: string;
  run_id: string;
  actor: AuditActor;
  action: string;
  evidence_refs: string[];
  review_gate: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type AuditInput = {
  run_id: string;
  actor: AuditActor;
  action: string;
  evidence_refs?: string[];
  review_gate?: boolean;
  details?: Record<string, unknown>;
};

type AuditState = {
  entries: AuditEntry[];
  counter: number;
};

const GLOBAL_KEY = "__atrium_audit_log__";

function getState(): AuditState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = { entries: [], counter: 0 } satisfies AuditState;
  }
  return store[GLOBAL_KEY] as AuditState;
}

/** Record an audit entry. Returns the stored entry with id and timestamp. */
export function recordAudit(input: AuditInput): AuditEntry {
  const state = getState();
  state.counter += 1;
  const entry: AuditEntry = {
    audit_id: `aud_${String(state.counter).padStart(4, "0")}`,
    run_id: input.run_id,
    actor: input.actor,
    action: input.action,
    evidence_refs: input.evidence_refs ?? [],
    review_gate: input.review_gate ?? false,
    timestamp: new Date().toISOString(),
    ...(input.details ? { details: input.details } : {}),
  };
  state.entries.push(entry);
  return entry;
}

/** Full audit trail for a run, in record order. */
export function getRunAudit(runId: string): AuditEntry[] {
  return getState().entries.filter((entry) => entry.run_id === runId);
}

/** Only the entries that opened a human review gate. */
export function getReviewGates(runId: string): AuditEntry[] {
  return getRunAudit(runId).filter((entry) => entry.review_gate);
}

/** Test/demo-reset helper. */
export function resetAuditLog(): void {
  const state = getState();
  state.entries = [];
  state.counter = 0;
}
