import { z } from "zod";
import {
  agentResultSchema,
  type AgentEvent,
  type AgentName,
  type AgentResult,
  type AgentStatus,
  type EventType,
} from "@/contracts";
import { emitEvent } from "./eventBridge";
import { appendRunEvent, nextEventSequence, runClock } from "./runStore";

/**
 * Shared runtime for the five core-loop agents.
 *
 * Every agent receives a context, returns an `AgentResult` envelope, and has
 * that envelope validated by Zod before anything downstream can read it.
 */
export type AgentContext = {
  run_id: string;
  /** Emits a typed event to the bus (or the local fallback) and the run log. */
  emit: (
    eventType: EventType,
    sourceAgent: AgentName,
    payload: Record<string, unknown>,
  ) => AgentEvent;
};

export function createAgentContext(runId: string): AgentContext {
  return {
    run_id: runId,
    emit(eventType, sourceAgent, payload) {
      const event = emitEvent({
        event_type: eventType,
        run_id: runId,
        source_agent: sourceAgent,
        timestamp: runClock(runId).next(),
        sequence: nextEventSequence(runId),
        payload,
      });
      appendRunEvent(runId, event);
      return event;
    },
  };
}

export type BuildResultInput<T> = {
  run_id: string;
  agent: AgentName;
  status?: AgentStatus;
  confidence: number;
  evidence_refs: string[];
  result: T;
  human_review_required?: boolean;
};

/**
 * Wraps an agent payload in the shared envelope and validates both the
 * envelope and the payload. Throws on contract violation, which is what we
 * want: a malformed agent output must never reach the run store.
 */
export function buildAgentResult<S extends z.ZodTypeAny>(
  resultSchema: S,
  input: BuildResultInput<z.input<S>>,
): AgentResult<z.infer<S>> {
  const humanReviewRequired =
    input.human_review_required ?? input.confidence < 0.6;

  const parsed = agentResultSchema(resultSchema).parse({
    run_id: input.run_id,
    agent: input.agent,
    status: input.status ?? (humanReviewRequired ? "needs_review" : "completed"),
    confidence: input.confidence,
    evidence_refs: input.evidence_refs,
    result: input.result,
    human_review_required: humanReviewRequired,
  });

  return parsed as AgentResult<z.infer<S>>;
}

/** Stable de-duplication that preserves first-seen order. */
export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
