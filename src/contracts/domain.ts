import { z } from "zod";
import {
  conceptIdSchema,
  misconceptionIdSchema,
  roomIdSchema,
  roomNameSchema,
  supportIdSchema,
} from "./ids";

// UI projection fixtures may carry view-only fields that the runtime schemas
// intentionally ignore.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UiCompat = Record<string, any>;

/* -------------------------------------------------------------------------- */
/* Students                                                                    */
/* -------------------------------------------------------------------------- */

export const masteryEstimateSchema = z.object({
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  trend: z.enum(["rising", "flat", "falling"]),
});

export type MasteryEstimate = z.infer<typeof masteryEstimateSchema>;

export const scaffoldingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type ScaffoldingLevel = z.infer<typeof scaffoldingLevelSchema>;

/** Mastery keys are the concept registry of the current run. */
export const masteryByConceptSchema = z.record(conceptIdSchema, masteryEstimateSchema);

export type MasteryByConcept = z.infer<typeof masteryByConceptSchema>;

export const studentSchema = z.object({
  student_id: z.string().min(1),
  display_name: z.string().min(1),
  avatar_key: z.string().min(1),
  supports: z.array(supportIdSchema),
  mastery: masteryByConceptSchema,
  recent_patterns: z.array(misconceptionIdSchema),
  scaffolding_level: scaffoldingLevelSchema,
  last_room: roomIdSchema.optional(),
});

export type Student = z.infer<typeof studentSchema>;

/* -------------------------------------------------------------------------- */
/* Assignment                                                                  */
/* -------------------------------------------------------------------------- */

export const assignmentQuestionSchema = z.object({
  question_id: z.string().min(1),
  prompt: z.string().min(1),
  concepts: z.array(conceptIdSchema).min(1),
  difficulty: z.number().min(0).max(1),
  expected_minutes: z.number().positive(),
  objective_id: z.string().min(1),
});

export type AssignmentQuestion = z.infer<typeof assignmentQuestionSchema> & UiCompat;

export const learningObjectiveSchema = z.object({
  objective_id: z.string().min(1),
  statement: z.string().min(1),
  concept: conceptIdSchema,
});

export type LearningObjective = z.infer<typeof learningObjectiveSchema>;

export const assignmentSchema = z.object({
  assignment_id: z.string().min(1),
  title: z.string().min(1),
  course: z.string().min(1),
  source: z.enum(["demo_seed", "upload", "curriculum"]),
  teaching_intent: z.string(),
  professor_constraints: z.array(z.string()),
  objectives: z.array(learningObjectiveSchema).min(1),
  questions: z.array(assignmentQuestionSchema).min(1),
});

export type Assignment = z.infer<typeof assignmentSchema> & UiCompat;

/* -------------------------------------------------------------------------- */
/* Assignment Architect output                                                 */
/* -------------------------------------------------------------------------- */

export const conceptSummarySchema = z.object({
  concept_id: conceptIdSchema,
  label: z.string().min(1),
  question_ids: z.array(z.string().min(1)).min(1),
  objective_ids: z.array(z.string().min(1)).min(1),
  weight: z.number().min(0).max(1),
  difficulty: z.number().min(0).max(1),
  expected_minutes: z.number().nonnegative(),
  evidence_refs: z.array(z.string()),
});

export type ConceptSummary = z.infer<typeof conceptSummarySchema> & UiCompat;

export const questionConceptMappingSchema = z.object({
  question_id: z.string().min(1),
  concepts: z.array(conceptIdSchema).min(1),
  objective_id: z.string().min(1),
  difficulty: z.number().min(0).max(1),
});

export type QuestionConceptMapping = z.infer<typeof questionConceptMappingSchema>;

export const assignmentAnalysisSchema = z.object({
  assignment_id: z.string().min(1),
  concepts: z.array(conceptSummarySchema).min(1),
  question_concept_map: z.array(questionConceptMappingSchema).min(1),
  overall_difficulty: z.number().min(0).max(1),
  total_expected_minutes: z.number().positive(),
  professor_constraints: z.array(z.string()),
});

export type AssignmentAnalysis = z.infer<typeof assignmentAnalysisSchema>;

/* -------------------------------------------------------------------------- */
/* Student Memory output                                                       */
/* -------------------------------------------------------------------------- */

export const conceptContextSchema = z.object({
  concept_id: conceptIdSchema,
  mastery: masteryEstimateSchema,
  gap: z.number().min(0).max(1),
  active_misconceptions: z.array(misconceptionIdSchema),
});

export type ConceptContext = z.infer<typeof conceptContextSchema>;

export const studentContextSchema = z.object({
  student_id: z.string().min(1),
  display_name: z.string().min(1),
  concept_context: z.array(conceptContextSchema).min(1),
  mean_mastery: z.number().min(0).max(1),
  weighted_gap: z.number().min(0).max(1),
  active_misconceptions: z.array(misconceptionIdSchema),
  documented_supports: z.array(supportIdSchema),
  successful_scaffolds: z.array(z.string()),
  scaffolding_level: scaffoldingLevelSchema,
  evidence_refs: z.array(z.string()),
});

export type StudentContext = z.infer<typeof studentContextSchema>;

export const studentContextBundleSchema = z.object({
  contexts: z.array(studentContextSchema).min(1),
  concept_coverage: z.array(conceptIdSchema).min(1),
});

export type StudentContextBundle = z.infer<typeof studentContextBundleSchema>;

/* -------------------------------------------------------------------------- */
/* Rooms                                                                       */
/* -------------------------------------------------------------------------- */

export const roomSchema = z.object({
  room_id: roomIdSchema,
  name: roomNameSchema,
  focus_concepts: z.array(conceptIdSchema).min(1),
  dominant_barrier: z.string().min(1),
  evidence_refs: z.array(z.string()),
  members: z.array(z.string().min(1)),
  base_adaptation: z.string().min(1),
  explanation: z.string().min(1),
});

export type Room = z.infer<typeof roomSchema>;

export const roomFitBreakdownSchema = z.object({
  student_id: z.string().min(1),
  room_id: roomIdSchema,
  concept_gap_similarity: z.number().min(0).max(1),
  misconception_similarity: z.number().min(0).max(1),
  mastery_band_similarity: z.number().min(0).max(1),
  support_compatibility: z.number().min(0).max(1),
  fragmentation_penalty: z.number().min(0),
  room_fit: z.number(),
});

export type RoomFitBreakdown = z.infer<typeof roomFitBreakdownSchema>;

export const groupingPlanSchema = z.object({
  rooms: z.array(roomSchema).min(3).max(4),
  placements: z
    .array(
      z.object({
        student_id: z.string().min(1),
        room_id: roomIdSchema,
        room_fit: z.number(),
        rationale: z.string().min(1),
        evidence_refs: z.array(z.string()),
      }),
    )
    .min(1),
  fit_matrix: z.array(roomFitBreakdownSchema).min(1),
  /** Proof that no accommodation or diagnosis label influenced placement. */
  grouping_signals_used: z.array(z.string()).min(1),
  excluded_signals: z.array(z.string()).min(1),
});

export type GroupingPlan = z.infer<typeof groupingPlanSchema>;

/* -------------------------------------------------------------------------- */
/* Accessibility                                                               */
/* -------------------------------------------------------------------------- */

export const deliveryChannelSchema = z.enum([
  "presentation",
  "pacing",
  "visibility",
  "sequencing",
]);

export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

export const deliveryDirectiveSchema = z.object({
  channel: deliveryChannelSchema,
  directive: z.string().min(1),
  derived_from: supportIdSchema,
});

export type DeliveryDirective = z.infer<typeof deliveryDirectiveSchema>;

export const accessibilityLayerSchema = z.object({
  student_id: z.string().min(1),
  room_id: roomIdSchema,
  documented_supports: z.array(supportIdSchema),
  directives: z.array(deliveryDirectiveSchema),
  /** Invariants asserted by the accessibility agent. */
  objectives_modified: z.literal(false),
  academic_content_removed: z.literal(false),
  support_change_proposed: z.literal(false),
  notes: z.string().min(1),
});

export type AccessibilityLayer = z.infer<typeof accessibilityLayerSchema>;

export const accessibilityPlanSchema = z.object({
  layers: z.array(accessibilityLayerSchema),
  room_delivery_notes: z.array(
    z.object({
      room_id: roomIdSchema,
      note: z.string().min(1),
    }),
  ),
  invariants: z.object({
    delivery_layer_only: z.literal(true),
    objectives_preserved: z.literal(true),
    support_changes_require_human: z.literal(true),
  }),
});

export type AccessibilityPlan = z.infer<typeof accessibilityPlanSchema>;

/* -------------------------------------------------------------------------- */
/* Assignment variants                                                         */
/* -------------------------------------------------------------------------- */

export const variantItemSchema = z.object({
  item_id: z.string().min(1),
  source_question_id: z.string().min(1),
  objective_id: z.string().min(1),
  concepts: z.array(conceptIdSchema).min(1),
  prompt: z.string().min(1),
  scaffold: z.string(),
  difficulty: z.number().min(0).max(1),
  expected_minutes: z.number().positive(),
});

export type VariantItem = z.infer<typeof variantItemSchema>;

export const objectiveCheckSchema = z.object({
  objective_id: z.string().min(1),
  statement: z.string().min(1),
  present_in_variant: z.boolean(),
  original_item_count: z.number().int().nonnegative(),
  variant_item_count: z.number().int().nonnegative(),
});

export type ObjectiveCheck = z.infer<typeof objectiveCheckSchema>;

export const objectivePreservationSchema = z.object({
  preserved: z.boolean(),
  checks: z.array(objectiveCheckSchema).min(1),
  missing_objective_ids: z.array(z.string()),
  notes: z.string().min(1),
});

export type ObjectivePreservation = z.infer<typeof objectivePreservationSchema>;

export const rigorCheckSchema = z.object({
  original_rigor: z.number().min(0).max(1),
  variant_rigor: z.number().min(0).max(1),
  delta: z.number(),
  tolerance: z.number().positive(),
  within_tolerance: z.boolean(),
  notes: z.string().min(1),
});

export type RigorCheck = z.infer<typeof rigorCheckSchema>;

export const studentOverlaySchema = z.object({
  student_id: z.string().min(1),
  room_id: roomIdSchema,
  presentation_notes: z.array(z.string()),
  pacing_notes: z.array(z.string()),
  visibility_notes: z.array(z.string()),
  sequencing_notes: z.array(z.string()),
  /** Overlays never touch the academic payload. */
  changes_item_content: z.literal(false),
});

export type StudentOverlay = z.infer<typeof studentOverlaySchema>;

export const assignmentVariantSchema = z.object({
  variant_id: z.string().min(1),
  room_id: roomIdSchema,
  room_name: roomNameSchema,
  based_on_assignment_id: z.string().min(1),
  title: z.string().min(1),
  focus_concepts: z.array(conceptIdSchema).min(1),
  items: z.array(variantItemSchema).min(1),
  objective_preservation: objectivePreservationSchema,
  rigor_check: rigorCheckSchema,
  student_overlays: z.array(studentOverlaySchema),
  rationale: z.string().min(1),
  evidence_refs: z.array(z.string()),
});

export type AssignmentVariant = z.infer<typeof assignmentVariantSchema> & UiCompat;

export const variantBundleSchema = z.object({
  variants: z.array(assignmentVariantSchema).min(3).max(4),
  all_objectives_preserved: z.boolean(),
  all_rigor_checks_passed: z.boolean(),
});

export type VariantBundle = z.infer<typeof variantBundleSchema>;

/* -------------------------------------------------------------------------- */
/* Assessment, lesson planning, and review gates                               */
/* -------------------------------------------------------------------------- */

export const questionResultSchema = z.object({
  question_id: z.string().min(1),
  correct: z.boolean(),
  misconception_ids: z.array(misconceptionIdSchema),
  evidence: z.string().min(1),
});

export type QuestionResult = z.infer<typeof questionResultSchema>;

export const assessmentResultSchema = z.object({
  run_id: z.string().min(1),
  student_id: z.string().min(1),
  score: z.number().min(0).max(1),
  question_results: z.array(questionResultSchema).min(1),
  misconceptions: z.array(misconceptionIdSchema),
  confidence: z.number().min(0).max(1),
  review_state: z.enum(["auto_approved", "needs_review", "approved", "rejected"]),
  reasoning_trace: z.array(z.string().min(1)).min(1),
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema> & UiCompat;

export const lessonPlanStepSchema = z.object({
  step_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  audience: z.union([z.literal("whole_class"), roomIdSchema]),
  duration_minutes: z.number().positive(),
  evidence_refs: z.array(z.string().min(1)),
});

export type LessonPlanStep = z.infer<typeof lessonPlanStepSchema>;

export const lessonPlanSchema = z.object({
  run_id: z.string().min(1),
  timeline: z.array(lessonPlanStepSchema).min(1),
  whole_class_intervention: z.string().min(1),
  room_rotations: z.record(roomIdSchema, z.string().min(1)),
  evidence_refs: z.array(z.string().min(1)),
  approval_state: z.enum(["pending", "approved", "rejected"]),
});

export type LessonPlan = z.infer<typeof lessonPlanSchema> & UiCompat;

export const reviewItemSchema = z.object({
  review_id: z.string().min(1),
  run_id: z.string().min(1),
  agent: z.string().min(1),
  review_type: z.enum(["low_confidence_grade", "final_plan"]),
  subject_id: z.string().min(1),
  reason: z.string().min(1),
  evidence_refs: z.array(z.string()),
  status: z.enum(["open", "pending", "approved", "rejected"]),
});

export type ReviewItem = z.infer<typeof reviewItemSchema> & UiCompat;
