/**
 * Mastery update types — Person C owned.
 *
 * Response events follow the MasteryTrace shape (learner, skill, correctness,
 * evidence) so the local BKT wrapper can be swapped for the real library
 * later without touching callers. See docs/PERSON_C_BACKEND_ASSESSMENT_EVOLUTION.md.
 */
import type { ConceptId } from "@/contracts";

/** One graded observation of a learner exercising one skill. */
export type MasteryResponseEvent = {
  learner_id: string;
  skill_id: ConceptId;
  correct: boolean;
  /**
   * Evidence weight in [0, 1] — how much this observation should move the
   * estimate. We pass the Assessment Agent's grading confidence here, so a
   * low-confidence (needs-review) grade barely shifts the model.
   */
  weight: number;
  evidence_ref: string;
};

/** Stored per-concept change, with the evidence that produced it. */
export type MasteryDelta = {
  student_id: string;
  concept_id: ConceptId;
  before: number;
  after: number;
  delta: number;
  before_confidence: number;
  after_confidence: number;
  evidence_refs: string[];
};

export type BktParams = {
  /** P(T): chance the skill is acquired after an opportunity. */
  p_learn: number;
  /** P(S): chance a mastered student still answers wrong. */
  p_slip: number;
  /** P(G): chance an unmastered student answers right anyway. */
  p_guess: number;
};
