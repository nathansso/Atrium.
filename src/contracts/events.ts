import { z } from "zod";
import { agentNameSchema } from "./agents";

/** Frozen per docs/CONTRACTS.md. */
export const eventTypes = [
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
] as const;

export const eventTypeSchema = z.enum(eventTypes);
export type EventType = z.infer<typeof eventTypeSchema>;

export const agentEventSchema = z.object({
  event_id: z.string().min(1).regex(/^[^\r\n\0]+$/),
  event_type: eventTypeSchema,
  run_id: z.string().min(1),
  source_agent: agentNameSchema,
  timestamp: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type AgentEvent = z.infer<typeof agentEventSchema>;

export function isAgentEvent(value: unknown): value is AgentEvent {
  return agentEventSchema.safeParse(value).success;
}

/** Events this branch owns end to end. */
export const coreLoopEventTypes = [
  "assignment.uploaded",
  "assignment.concepts.extracted",
  "student.context.ready",
  "groups.proposed",
  "accessibility.layers.ready",
  "assignment.variants.ready",
] as const satisfies readonly EventType[];
