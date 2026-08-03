import {
  misconceptionConcept,
  studentContextBundleSchema,
  type AgentResult,
  type AssignmentAnalysis,
  type ConceptContext,
  type ConceptId,
  type Student,
  type StudentContext,
  type StudentContextBundle,
} from "@/contracts";
import { successfulScaffolds } from "@/seed/students";
import { buildAgentResult, type AgentContext } from "../agentRuntime";
import { clamp, round4 } from "../deterministic";

/**
 * Student Memory Agent.
 *
 * Consumes: `assignment.concepts.extracted`
 * Publishes: `student.context.ready`
 *
 * Retrieves only the memory that is relevant to the concepts this assignment
 * actually tests: mastery, recent misconception evidence, documented supports,
 * and scaffolds that previously worked.
 */
export const AGENT = "student_memory_agent" as const;

export function buildStudentContext(
  student: Student,
  analysis: AssignmentAnalysis,
): StudentContext {
  const relevantConcepts = analysis.concepts.map((c) => c.concept_id);
  const weightByConcept = new Map<ConceptId, number>(
    analysis.concepts.map((c) => [c.concept_id, c.weight]),
  );

  const conceptContext: ConceptContext[] = relevantConcepts.map((conceptId) => {
    const mastery = student.mastery[conceptId];
    return {
      concept_id: conceptId,
      mastery,
      gap: round4(clamp(1 - mastery.score)),
      active_misconceptions: student.recent_patterns.filter(
        (pattern) => misconceptionConcept[pattern] === conceptId,
      ),
    };
  });

  const meanMastery = round4(
    conceptContext.reduce((sum, c) => sum + c.mastery.score, 0) /
      conceptContext.length,
  );

  const weightedGap = round4(
    clamp(
      conceptContext.reduce(
        (sum, c) => sum + c.gap * (weightByConcept.get(c.concept_id) ?? 0),
        0,
      ),
    ),
  );

  const activeMisconceptions = student.recent_patterns.filter((pattern) =>
    relevantConcepts.includes(misconceptionConcept[pattern]),
  );

  const evidenceRefs = [
    ...conceptContext.map(
      (c) =>
        `student:${student.student_id}#mastery:${c.concept_id}:${c.mastery.score.toFixed(2)}`,
    ),
    ...activeMisconceptions.map(
      (m) => `student:${student.student_id}#pattern:${m}`,
    ),
  ];

  return {
    student_id: student.student_id,
    display_name: student.display_name,
    concept_context: conceptContext,
    mean_mastery: meanMastery,
    weighted_gap: weightedGap,
    active_misconceptions: activeMisconceptions,
    documented_supports: student.supports,
    successful_scaffolds: successfulScaffolds[student.student_id] ?? [],
    scaffolding_level: student.scaffolding_level,
    evidence_refs: evidenceRefs,
  };
}

export function runStudentMemory(
  ctx: AgentContext,
  students: Student[],
  analysis: AssignmentAnalysis,
): AgentResult<StudentContextBundle> {
  const contexts = students
    .map((student) => buildStudentContext(student, analysis))
    .sort((a, b) => (a.student_id < b.student_id ? -1 : 1));

  // Confidence is the mean of the stored mastery confidences we actually used.
  const confidenceSamples = contexts.flatMap((c) =>
    c.concept_context.map((cc) => cc.mastery.confidence),
  );
  const confidence = round4(
    clamp(
      confidenceSamples.reduce((sum, v) => sum + v, 0) /
        Math.max(1, confidenceSamples.length),
    ),
  );

  const lowConfidenceStudents = contexts.filter((c) =>
    c.concept_context.some((cc) => cc.mastery.confidence < 0.5),
  );

  const bundle: StudentContextBundle = {
    contexts,
    concept_coverage: analysis.concepts.map((c) => c.concept_id),
  };

  const result = buildAgentResult(studentContextBundleSchema, {
    run_id: ctx.run_id,
    agent: AGENT,
    confidence,
    evidence_refs: contexts.flatMap((c) => c.evidence_refs),
    result: bundle,
    human_review_required: lowConfidenceStudents.length > 0,
  });

  ctx.emit("student.context.ready", AGENT, {
    student_count: contexts.length,
    concept_coverage: bundle.concept_coverage,
    students,
    student_contexts: contexts,
    low_confidence_students: lowConfidenceStudents.map((c) => c.student_id),
    confidence: result.confidence,
  });

  return result;
}
