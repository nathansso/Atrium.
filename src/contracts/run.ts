import { z } from "zod";
import { agentEventSchema } from "./events";
import {
  accessibilityPlanSchema,
  assessmentResultSchema,
  assignmentSchema,
  assignmentVariantSchema,
  conceptSummarySchema,
  groupingPlanSchema,
  lessonPlanSchema,
  reviewItemSchema,
  roomSchema,
  studentContextSchema,
  studentSchema,
} from "./domain";

export const runStatuses = [
  "created",
  "analyzing",
  "grouped",
  "variants_ready",
  "assessed",
  "planned",
] as const;

export const runStatusSchema = z.enum(runStatuses);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runStateSchema = z.object({
  run_id: z.string().min(1),
  status: runStatusSchema,
  created_at: z.string().min(1),
  demo_mode: z.boolean(),
  teaching_intent: z.string(),
  assignment: assignmentSchema,
  concepts: z.array(conceptSummarySchema),
  students: z.array(studentSchema),
  student_contexts: z.array(studentContextSchema),
  rooms: z.array(roomSchema),
  grouping: groupingPlanSchema.nullable(),
  accessibility: accessibilityPlanSchema.nullable(),
  variants: z.array(assignmentVariantSchema),
  assessments: z.array(assessmentResultSchema),
  lesson_plan: lessonPlanSchema.optional(),
  review_queue: z.array(reviewItemSchema),
  events: z.array(agentEventSchema),
});

export type RunState = z.infer<typeof runStateSchema>;

export const createRunRequestSchema = z.object({
  assignment_id: z.string().min(1).optional(),
  assignment_text: z.string().trim().min(1).max(50_000).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  teaching_intent: z.string().max(500).optional(),
  demo_mode: z.boolean().optional(),
  /** Raw upload payload. Ignored in demo mode. */
  assignment: assignmentSchema.optional(),
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export type CreateRunResponse = {
  run_id: string;
  status?: RunStatus;
  state?: RunState;
  agent_results?: unknown;
};
