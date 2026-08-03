import {
  assignmentAnalysisSchema,
  conceptLabels,
  type AgentResult,
  type Assignment,
  type AssignmentAnalysis,
  type ConceptId,
  type ConceptSummary,
} from "@/contracts";
import { buildAgentResult, uniqueSorted, type AgentContext } from "../agentRuntime";
import { clamp, round4 } from "../deterministic";
import type { MotionProvenance } from "../motion/assignmentMotion";

/**
 * Assignment Architect.
 *
 * Consumes: `assignment.uploaded`
 * Publishes: `assignment.concepts.extracted`
 *
 * Turns the raw assignment into concept summaries, question-to-concept
 * mappings, difficulty, and a time expectation. Deterministic: the analysis is
 * derived arithmetically from the assignment, not sampled from a model.
 */
export const AGENT = "assignment_architect" as const;

function evidenceRef(assignmentId: string, questionId: string): string {
  return `assignment:${assignmentId}#${questionId}`;
}

export function analyzeAssignment(assignment: Assignment): AssignmentAnalysis {
  const totalShare = assignment.questions.length;

  const byConcept = new Map<
    ConceptId,
    {
      questionIds: string[];
      objectiveIds: string[];
      share: number;
      difficultySum: number;
      minutes: number;
    }
  >();

  for (const question of assignment.questions) {
    // A question that touches N concepts contributes 1/N to each of them, so
    // concept weights always sum to 1 across the assignment.
    const share = 1 / question.concepts.length;
    for (const concept of question.concepts) {
      const bucket = byConcept.get(concept) ?? {
        questionIds: [],
        objectiveIds: [],
        share: 0,
        difficultySum: 0,
        minutes: 0,
      };
      bucket.questionIds.push(question.question_id);
      bucket.objectiveIds.push(question.objective_id);
      bucket.share += share;
      bucket.difficultySum += question.difficulty;
      bucket.minutes += question.expected_minutes * share;
      byConcept.set(concept, bucket);
    }
  }

  const concepts: ConceptSummary[] = [...byConcept.entries()]
    .map(([conceptId, bucket]) => ({
      concept_id: conceptId,
      label: conceptLabels[conceptId],
      question_ids: bucket.questionIds,
      objective_ids: uniqueSorted(bucket.objectiveIds),
      weight: round4(bucket.share / totalShare),
      difficulty: round4(bucket.difficultySum / bucket.questionIds.length),
      expected_minutes: round4(bucket.minutes),
      evidence_refs: bucket.questionIds.map((qid) =>
        evidenceRef(assignment.assignment_id, qid),
      ),
    }))
    .sort((a, b) => (a.concept_id < b.concept_id ? -1 : 1));

  const overallDifficulty = round4(
    assignment.questions.reduce((sum, q) => sum + q.difficulty, 0) /
      assignment.questions.length,
  );

  return {
    assignment_id: assignment.assignment_id,
    concepts,
    question_concept_map: assignment.questions.map((question) => ({
      question_id: question.question_id,
      concepts: question.concepts,
      objective_id: question.objective_id,
      difficulty: question.difficulty,
    })),
    overall_difficulty: overallDifficulty,
    total_expected_minutes: round4(
      assignment.questions.reduce((sum, q) => sum + q.expected_minutes, 0),
    ),
    professor_constraints: assignment.professor_constraints,
  };
}

export function runAssignmentArchitect(
  ctx: AgentContext,
  assignment: Assignment,
  provenance?: MotionProvenance,
): AgentResult<AssignmentAnalysis> {
  const analysis = analyzeAssignment(assignment);

  // Confidence reflects how completely the declared objectives are covered by
  // questions that were actually mapped to a concept.
  const declaredObjectives = new Set(
    assignment.objectives.map((o) => o.objective_id),
  );
  const mappedObjectives = new Set(
    analysis.question_concept_map.map((m) => m.objective_id),
  );
  const covered = [...declaredObjectives].filter((id) =>
    mappedObjectives.has(id),
  ).length;
  const coverage = covered / declaredObjectives.size;
  const confidence = round4(clamp(0.6 + 0.35 * coverage));

  const result = buildAgentResult(assignmentAnalysisSchema, {
    run_id: ctx.run_id,
    agent: AGENT,
    confidence,
    evidence_refs: [
      ...analysis.concepts.flatMap((c) => c.evidence_refs),
      ...(provenance?.token ? [`rocketride:${provenance.token}`] : []),
    ],
    result: analysis,
    human_review_required: coverage < 1,
  });

  ctx.emit("assignment.concepts.extracted", AGENT, {
    assignment_id: analysis.assignment_id,
    concepts: analysis.concepts.map((c) => ({
      concept_id: c.concept_id,
      label: c.label,
      weight: c.weight,
      difficulty: c.difficulty,
    })),
    overall_difficulty: analysis.overall_difficulty,
    total_expected_minutes: analysis.total_expected_minutes,
    confidence: result.confidence,
    ...(provenance ? { pipeline: provenance } : {}),
  });

  return result;
}
