import { z } from "zod";

/**
 * Curriculum-research contracts — the source-grounded authoring path.
 *
 * These are deliberately decoupled from the fixed Algebra `ConceptId` enum. A
 * research draft produces its own curriculum-scoped string concept ids (for
 * example `ai:training-data`). Binding those into student memory, grouping and
 * mastery is a later phase; this contract layer only has to describe a cited,
 * reviewable draft that an educator can approve.
 *
 * Everything student-facing carries citations by construction: `ResearchClaim`
 * and `CurriculumChunk` both require a non-empty `citations` array, so an
 * unvalidated web synthesis can never satisfy the schema.
 */

/** An http(s) URL. Kept as a refine so it is robust across zod string-format APIs. */
const urlString = z
  .string()
  .min(1)
  .refine((value) => /^https?:\/\/\S+$/i.test(value), "must be an http(s) URL");

/** Curriculum-scoped concept id, e.g. `ai:training-data` — a stable slug. */
export const curriculumConceptIdSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/,
    'must be a slug such as "ai:training-data"',
  );
export type CurriculumConceptId = z.infer<typeof curriculumConceptIdSchema>;

export const sourceTypes = [
  "academic",
  "official_standard",
  "reference",
  "news",
  "industry",
  "educational",
  "other",
] as const;
export const sourceTypeSchema = z.enum(sourceTypes);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceProvenanceSchema = z.enum(["firecrawl", "mock", "manual"]);
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;

/** A retrieved, citable source with full provenance. */
export const researchSourceSchema = z.object({
  source_id: z.string().min(1),
  url: urlString,
  title: z.string().min(1),
  publisher: z.string().min(1),
  source_type: sourceTypeSchema,
  /** ISO date the source was published, or null when the provider omits it. */
  published_at: z.string().nullable().default(null),
  /** ISO timestamp the source was retrieved. */
  retrieved_at: z.string().min(1),
  excerpt: z.string().min(1),
  /** Why this source is trustworthy for this topic. */
  credibility: z.string().min(1),
  provenance: sourceProvenanceSchema.default("firecrawl"),
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;

/** A single factual claim, backed by one or more sources. */
export const researchClaimSchema = z.object({
  claim_id: z.string().min(1),
  statement: z.string().min(1),
  concept_id: curriculumConceptIdSchema,
  /** `source_id`s backing this claim. At least one — claims are never bare. */
  citations: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  /** Set when sources disagree on this claim; surfaced to the educator. */
  conflicting: z.boolean().default(false),
  note: z.string().optional(),
});
export type ResearchClaim = z.infer<typeof researchClaimSchema>;

/** A concept in the drafted curriculum, with prerequisite edges. */
export const curriculumConceptSchema = z.object({
  concept_id: curriculumConceptIdSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  prerequisites: z.array(curriculumConceptIdSchema).default([]),
});
export type CurriculumConcept = z.infer<typeof curriculumConceptSchema>;

export const checkKindSchema = z.enum([
  "multiple_choice",
  "short_answer",
  "explanation",
]);
export type CheckKind = z.infer<typeof checkKindSchema>;

/** A comprehension check attached to a chunk. */
export const comprehensionCheckSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  kind: checkKindSchema.default("short_answer"),
});
export type ComprehensionCheck = z.infer<typeof comprehensionCheckSchema>;

/**
 * A sequenced, student-facing learning chunk.
 *
 * `objective_ids`, `concept_ids`, `duration_minutes`, a `comprehension_check`
 * and non-empty `citations` are all required — this is the schema-level
 * guarantee that unapproved web synthesis cannot become student-facing work.
 */
export const curriculumChunkSchema = z.object({
  chunk_id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().min(0),
  concept_ids: z.array(curriculumConceptIdSchema).min(1),
  objective_ids: z.array(z.string().min(1)).min(1),
  body: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  comprehension_check: comprehensionCheckSchema,
  /** `source_id`s — required, so every chunk is traceable to evidence. */
  citations: z.array(z.string().min(1)).min(1),
});
export type CurriculumChunk = z.infer<typeof curriculumChunkSchema>;

/** The educator's research request. */
export const researchRequestSchema = z.object({
  topic: z.string().min(1),
  audience: z.string().min(1),
  grade_level: z.string().optional(),
  prior_knowledge: z.string().optional(),
  teaching_intent: z.string().optional(),
  time_budget_minutes: z.number().int().positive().default(45),
  include_domains: z.array(z.string().min(1)).default([]),
  exclude_domains: z.array(z.string().min(1)).default([]),
  /** ISO date; sources older than this are flagged as stale, not dropped. */
  freshness_cutoff: z.string().nullable().default(null),
  max_sources: z.number().int().min(1).max(20).default(8),
});
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

/** A concern surfaced to the educator before approval. */
export const researchWarningSchema = z.object({
  kind: z.enum([
    "weak_evidence",
    "conflicting_evidence",
    "stale_source",
    "thin_coverage",
    "uncited_chunk",
  ]),
  message: z.string().min(1),
  concept_id: curriculumConceptIdSchema.optional(),
  refs: z.array(z.string().min(1)).default([]),
});
export type ResearchWarning = z.infer<typeof researchWarningSchema>;

export const curriculumApprovalStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export type CurriculumApprovalState = z.infer<
  typeof curriculumApprovalStateSchema
>;

/** The full reviewable draft an educator inspects and approves. */
export const curriculumDraftSchema = z.object({
  draft_id: z.string().min(1),
  topic: z.string().min(1),
  audience: z.string().min(1),
  teaching_intent: z.string().nullable().default(null),
  created_at: z.string().min(1),
  concepts: z.array(curriculumConceptSchema).min(1),
  sources: z.array(researchSourceSchema).min(1),
  claims: z.array(researchClaimSchema).min(1),
  chunks: z.array(curriculumChunkSchema).min(1),
  /** Prerequisite-topological order of `concept_id`s. */
  sequence: z.array(curriculumConceptIdSchema).min(1),
  warnings: z.array(researchWarningSchema).default([]),
  approval_state: curriculumApprovalStateSchema.default("pending"),
});
export type CurriculumDraft = z.infer<typeof curriculumDraftSchema>;

/** An educator's approval (or rejection) decision on a draft. */
export const curriculumApprovalSchema = z.object({
  draft_id: z.string().min(1),
  state: curriculumApprovalStateSchema,
  approved_by: z.string().min(1),
  note: z.string().optional(),
  decided_at: z.string().min(1),
});
export type CurriculumApproval = z.infer<typeof curriculumApprovalSchema>;

/** A durable link between an approved research draft and its classroom run. */
export const curriculumLaunchSchema = z.object({
  draft_id: z.string().min(1),
  assignment_id: z.string().min(1),
  run_id: z.string().min(1),
  launched_by: z.string().min(1),
  launched_at: z.string().min(1),
  teaching_intent: z.string().min(1),
});
export type CurriculumLaunch = z.infer<typeof curriculumLaunchSchema>;

export const curriculumLaunchRequestSchema = z.object({
  launched_by: z.string().min(1).default("educator"),
  teaching_intent: z.string().min(1).max(500).optional(),
});
export type CurriculumLaunchRequest = z.infer<typeof curriculumLaunchRequestSchema>;

/** Request body for approving/rejecting a draft. */
export const curriculumApprovalRequestSchema = z.object({
  approved_by: z.string().min(1).default("educator"),
  note: z.string().optional(),
  reject: z.boolean().default(false),
});
export type CurriculumApprovalRequest = z.infer<
  typeof curriculumApprovalRequestSchema
>;

/**
 * Guild trace-action vocabulary for the research lifecycle.
 *
 * These are recorded as Guild audit traces, NOT as run-lifecycle `AgentEvent`s.
 * Keeping them out of the `eventTypes` union avoids destabilising the world
 * projection and the ordered-sequence tests; they fold into the run event
 * stream only when the curriculum path is wired into `coreLoop` (Phase 2).
 */
export const curriculumTraceActions = [
  "curriculum.research.requested",
  "curriculum.sources.collected",
  "curriculum.draft.ready",
  "curriculum.approved",
  "curriculum.rejected",
] as const;
export type CurriculumTraceAction = (typeof curriculumTraceActions)[number];
