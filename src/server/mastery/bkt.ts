/**
 * Local typed BKT wrapper — Person C owned.
 *
 * Bayesian Knowledge Tracing posterior update over MasteryTrace-shaped
 * response events. Deterministic: same events in, same estimates out.
 */
import type { MasteryEstimate } from "@/contracts";
import type { BktParams, MasteryDelta, MasteryResponseEvent } from "./types";

/**
 * Tuned for the demo scale: visible movement after one assignment without
 * catapulting every correct answer straight to mastery.
 */
export const DEFAULT_BKT_PARAMS: BktParams = {
  p_learn: 0.04,
  p_slip: 0.2,
  p_guess: 0.3,
};

const MIN_CONFIDENCE = 0.3;
const MAX_CONFIDENCE = 0.95;
/** |delta| below this reads as noise, not a trend. */
const TREND_EPSILON = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One unweighted BKT posterior update: P(mastery | observation) plus learning. */
export function bktUpdate(
  prior: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const { p_learn, p_slip, p_guess } = params;
  const pObservation = correct
    ? prior * (1 - p_slip) + (1 - prior) * p_guess
    : prior * p_slip + (1 - prior) * (1 - p_guess);
  const posterior = correct
    ? (prior * (1 - p_slip)) / pObservation
    : (prior * p_slip) / pObservation;
  return clamp(posterior + (1 - posterior) * p_learn, 0, 1);
}

/**
 * Weighted step: blend from the prior toward the BKT posterior by the
 * evidence weight, so low-confidence grades move the model less.
 */
export function weightedBktUpdate(
  prior: number,
  correct: boolean,
  weight: number,
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const target = bktUpdate(prior, correct, params);
  return round4(prior + (target - prior) * clamp(weight, 0, 1));
}

/**
 * Confidence rule from the person-C plan: confidence increases when new
 * evidence aligns with the old pattern (trend), and decreases when the
 * evidence contradicts it.
 */
function adjustConfidence(confidence: number, trend: MasteryEstimate["trend"], correct: boolean): number {
  const aligned = (correct && trend === "rising") || (!correct && trend === "falling");
  const contradicts = (correct && trend === "falling") || (!correct && trend === "rising");
  const step = aligned ? 0.06 : contradicts ? -0.04 : 0.02;
  return round2(clamp(confidence + step, MIN_CONFIDENCE, MAX_CONFIDENCE));
}

function trendFromDelta(delta: number): MasteryEstimate["trend"] {
  if (delta > TREND_EPSILON) return "rising";
  if (delta < -TREND_EPSILON) return "falling";
  return "flat";
}

export type MasteryUpdateResult = {
  estimate: MasteryEstimate;
  delta: MasteryDelta;
};

/**
 * Fold a learner's response events for a single skill into an updated
 * estimate, returning the stored delta with its evidence references.
 * Events must already be filtered to `skill_id` and in response order.
 */
export function updateEstimate(
  studentId: string,
  conceptId: MasteryDelta["concept_id"],
  prior: MasteryEstimate,
  events: MasteryResponseEvent[],
  params: BktParams = DEFAULT_BKT_PARAMS,
): MasteryUpdateResult {
  let score = prior.score;
  let confidence = prior.confidence;
  const evidenceRefs: string[] = [];

  for (const event of events) {
    score = weightedBktUpdate(score, event.correct, event.weight, params);
    confidence = adjustConfidence(confidence, prior.trend, event.correct);
    evidenceRefs.push(event.evidence_ref);
  }

  const delta = round4(score - prior.score);
  const estimate: MasteryEstimate = {
    score,
    confidence,
    trend: events.length > 0 ? trendFromDelta(delta) : prior.trend,
  };

  return {
    estimate,
    delta: {
      student_id: studentId,
      concept_id: conceptId,
      before: round4(prior.score),
      after: score,
      delta,
      before_confidence: prior.confidence,
      after_confidence: confidence,
      evidence_refs: evidenceRefs,
    },
  };
}
