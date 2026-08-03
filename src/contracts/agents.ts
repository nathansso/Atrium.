import { z } from "zod";

/** Frozen per docs/CONTRACTS.md. */
export const agentNames = [
  "assignment_architect",
  "student_memory_agent",
  "grouping_agent",
  "accessibility_agent",
  "assignment_curator",
  "assessment_agent",
  "classroom_evolution_agent",
  "lesson_planner",
  // Source-grounded curriculum authoring (issue #4). Runs ahead of Assignment
  // Architect once wired into coreLoop; today it drives the standalone
  // curriculum-research preview route.
  "curriculum_research_agent",
] as const;

export const agentNameSchema = z.enum(agentNames);
export type AgentName = z.infer<typeof agentNameSchema>;

export const agentStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "needs_review",
] as const;

export const agentStatusSchema = z.enum(agentStatuses);
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentResultStatus = AgentStatus;

export type AgentResult<T> = {
  run_id: string;
  agent: AgentName;
  status: AgentStatus;
  confidence: number;
  evidence_refs: string[];
  result: T;
  human_review_required: boolean;
};

/**
 * Builds the Zod schema for an `AgentResult<T>` around a result schema.
 * Every agent in this branch validates its output through this envelope
 * before the value reaches the run store or the event bus.
 */
export function agentResultSchema<T extends z.ZodTypeAny>(result: T) {
  return z.object({
    run_id: z.string().min(1),
    agent: agentNameSchema,
    status: agentStatusSchema,
    confidence: z.number().min(0).max(1),
    evidence_refs: z.array(z.string()),
    result,
    human_review_required: z.boolean(),
  });
}
