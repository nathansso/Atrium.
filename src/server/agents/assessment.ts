/**
 * Assessment Agent — Person C owned.
 *
 * Consumes `submissions.received`, publishes `assessment.completed` (the
 * orchestrator in src/server/submissions emits the events).
 *
 * Deterministic grading: answers are compared against the answer key, and
 * misconceptions are classified from error fingerprints visible in the
 * written work. Confidence drops for ambiguous or unexplained work; any
 * grade below the review threshold enters the professor review queue and is
 * never auto-published.
 */
import { z } from "zod";
import type {
  AgentResult,
  AssessmentResult,
  MisconceptionId,
  ReviewItem,
  RunState,
} from "@/contracts";
import type { SeedSubmission } from "@/seed/submissions";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

const BASE_CONFIDENCE = 0.95;
const PENALTY_AMBIGUOUS_WORK = 0.25;
const PENALTY_UNEXPLAINED_WRONG = 0.04;
const PENALTY_MISSING_WORK = 0.06;
const PENALTY_CONTRADICTORY_WORK = 0.05;

const misconceptionIds = [
  "sign_error_negatives",
  "partial_distribution",
  "operation_order_confusion",
  "like_terms_overcombine",
] as const satisfies readonly MisconceptionId[];

const misconceptionLabels: Partial<Record<MisconceptionId, string>> = {
  sign_error_negatives: "sign error on negative integers",
  partial_distribution: "distributed to only the first term",
  operation_order_confusion: "operations applied in the wrong order",
  like_terms_overcombine: "combined unlike terms together",
};

const questionResultSchema = z.object({
  question_id: z.string().min(1),
  correct: z.boolean(),
  misconception_ids: z.array(z.enum(misconceptionIds)),
  evidence: z.string().min(1),
});

const assessmentResultSchema = z.object({
  run_id: z.string().min(1),
  student_id: z.string().min(1),
  score: z.number().min(0).max(1),
  question_results: z.array(questionResultSchema).min(1),
  misconceptions: z.array(z.enum(misconceptionIds)),
  confidence: z.number().min(0).max(1),
  review_state: z.enum(["auto_approved", "needs_review", "approved", "rejected"]),
  reasoning_trace: z.array(z.string().min(1)).min(1),
});

const assessmentOutputSchema = z.object({
  assessments: z.array(assessmentResultSchema).min(1),
  review_items: z.array(
    z.object({
      review_id: z.string().min(1),
      run_id: z.string().min(1),
      agent: z.literal("assessment_agent"),
      review_type: z.enum(["low_confidence_grade", "final_plan"]),
      subject_id: z.string().min(1),
      reason: z.string().min(1),
      evidence_refs: z.array(z.string().min(1)).min(1),
      status: z.enum(["pending", "approved", "rejected"]),
    }),
  ),
});

export type AssessmentAgentOutput = {
  assessments: AssessmentResult[];
  review_items: ReviewItem[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function gradeSubmission(
  run: RunState,
  submission: SeedSubmission,
  answerKey: Record<string, string>,
): AssessmentResult {
  const trace: string[] = [];
  const questionResults: AssessmentResult["question_results"] = [];
  const misconceptions = new Set<MisconceptionId>();
  let confidence = BASE_CONFIDENCE;
  let correctCount = 0;

  for (const response of submission.responses) {
    const expected = answerKey[response.question_id];
    const evidenceRef = `submission:${submission.student_id}:${response.question_id}`;
    const correct = response.answer === expected;
    const responseMisconceptions: MisconceptionId[] = [];

    if (correct) {
      correctCount += 1;
      trace.push(
        `${response.question_id}: answer "${response.answer}" matches key "${expected}" → correct (${evidenceRef})`,
      );
      if (response.error_fingerprint) {
        // Right answer over work that shows a known error pattern — grade
        // stands but certainty drops.
        confidence -= PENALTY_CONTRADICTORY_WORK;
        trace.push(
          `${response.question_id}: work contradicts the answer — shows ${misconceptionLabels[response.error_fingerprint] ?? response.error_fingerprint} (${evidenceRef})`,
        );
      }
    } else {
      trace.push(
        `${response.question_id}: answer "${response.answer}" ≠ key "${expected}" → incorrect (${evidenceRef})`,
      );
      if (response.error_fingerprint) {
        responseMisconceptions.push(response.error_fingerprint);
        misconceptions.add(response.error_fingerprint);
        trace.push(
          `${response.question_id}: work "${response.work_shown}" shows ${misconceptionLabels[response.error_fingerprint] ?? response.error_fingerprint} → ${response.error_fingerprint} (${evidenceRef})`,
        );
      } else {
        confidence -= PENALTY_UNEXPLAINED_WRONG;
        trace.push(
          `${response.question_id}: no recognizable error pattern in the work — cannot classify the mistake (${evidenceRef})`,
        );
      }
    }

    if (response.legibility === "ambiguous") {
      confidence -= PENALTY_AMBIGUOUS_WORK;
      trace.push(
        `${response.question_id}: work is ambiguous ("${response.work_shown}") — grading certainty reduced (${evidenceRef})`,
      );
    }
    if (response.work_shown === "") {
      confidence -= PENALTY_MISSING_WORK;
      trace.push(`${response.question_id}: no work shown — grading certainty reduced (${evidenceRef})`);
    }

    questionResults.push({
      question_id: response.question_id,
      correct,
      misconception_ids: responseMisconceptions,
      evidence: evidenceRef,
    });
  }

  confidence = round2(Math.max(0.4, Math.min(BASE_CONFIDENCE, confidence)));
  const needsReview = confidence < REVIEW_CONFIDENCE_THRESHOLD;
  trace.push(
    needsReview
      ? `confidence ${confidence} < ${REVIEW_CONFIDENCE_THRESHOLD} → grade held for professor review, not published`
      : `confidence ${confidence} ≥ ${REVIEW_CONFIDENCE_THRESHOLD} → grade auto-approved`,
  );

  return {
    run_id: run.run_id,
    student_id: submission.student_id,
    score: round2(correctCount / submission.responses.length),
    question_results: questionResults,
    misconceptions: [...misconceptions],
    confidence,
    review_state: needsReview ? "needs_review" : "auto_approved",
    reasoning_trace: trace,
  };
}

export function runAssessmentAgent(
  run: RunState,
  submissions: SeedSubmission[],
  answerKey: Record<string, string>,
): AgentResult<AssessmentAgentOutput> {
  const ordered = [...submissions].sort((a, b) => a.student_id.localeCompare(b.student_id));
  const assessments = ordered.map((submission) => gradeSubmission(run, submission, answerKey));

  const reviewItems: ReviewItem[] = assessments
    .filter((assessment) => assessment.review_state === "needs_review")
    .map((assessment) => ({
      review_id: `rev-grade-${assessment.student_id}`,
      run_id: run.run_id,
      agent: "assessment_agent",
      review_type: "low_confidence_grade",
      subject_id: assessment.student_id,
      reason: `Grading confidence ${assessment.confidence} is below ${REVIEW_CONFIDENCE_THRESHOLD}: ambiguous or missing work.`,
      evidence_refs: assessment.question_results.map((result) => result.evidence),
      status: "pending",
    }));

  const output = assessmentOutputSchema.parse({
    assessments,
    review_items: reviewItems,
  }) as AssessmentAgentOutput;

  const minConfidence = Math.min(...assessments.map((assessment) => assessment.confidence));
  return {
    run_id: run.run_id,
    agent: "assessment_agent",
    status: reviewItems.length > 0 ? "needs_review" : "completed",
    confidence: minConfidence,
    evidence_refs: ordered.map((submission) => `submission:${submission.student_id}`),
    result: output,
    human_review_required: reviewItems.length > 0,
  };
}
