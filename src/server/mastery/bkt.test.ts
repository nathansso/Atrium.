import { describe, expect, it } from "vitest";
import type { MasteryEstimate } from "@/contracts";
import { bktUpdate, updateEstimate, weightedBktUpdate } from "./bkt";
import type { MasteryResponseEvent } from "./types";

function event(overrides: Partial<MasteryResponseEvent>): MasteryResponseEvent {
  return {
    learner_id: "s99",
    skill_id: "integer_operations",
    correct: true,
    weight: 0.95,
    evidence_ref: "submission:s99:q1",
    ...overrides,
  };
}

describe("bktUpdate", () => {
  it("raises mastery on a correct response", () => {
    expect(bktUpdate(0.35, true)).toBeGreaterThan(0.35);
  });

  it("lowers mastery on an incorrect response", () => {
    expect(bktUpdate(0.35, false)).toBeLessThan(0.35);
  });

  it("stays within [0, 1]", () => {
    expect(bktUpdate(0.01, false)).toBeGreaterThanOrEqual(0);
    expect(bktUpdate(0.99, true)).toBeLessThanOrEqual(1);
  });

  it("is deterministic", () => {
    expect(bktUpdate(0.42, true)).toBe(bktUpdate(0.42, true));
  });
});

describe("weightedBktUpdate", () => {
  it("moves less under a low evidence weight", () => {
    const fullMove = weightedBktUpdate(0.4, true, 1) - 0.4;
    const halfMove = weightedBktUpdate(0.4, true, 0.5) - 0.4;
    expect(halfMove).toBeGreaterThan(0);
    expect(halfMove).toBeLessThan(fullMove);
  });

  it("does not move at weight zero", () => {
    expect(weightedBktUpdate(0.4, false, 0)).toBe(0.4);
  });
});

describe("updateEstimate", () => {
  const prior: MasteryEstimate = { score: 0.35, confidence: 0.7, trend: "rising" };

  it("folds events in order and stores the delta with evidence", () => {
    const { estimate, delta } = updateEstimate("s99", "integer_operations", prior, [
      event({ evidence_ref: "submission:s99:q1" }),
      event({ evidence_ref: "submission:s99:q2" }),
    ]);
    expect(estimate.score).toBeGreaterThan(prior.score);
    expect(delta.before).toBe(0.35);
    expect(delta.after).toBe(estimate.score);
    expect(delta.evidence_refs).toEqual(["submission:s99:q1", "submission:s99:q2"]);
  });

  it("increases confidence when evidence aligns with the prior trend", () => {
    const { estimate } = updateEstimate("s99", "integer_operations", prior, [event({ correct: true })]);
    expect(estimate.confidence).toBeGreaterThan(prior.confidence);
  });

  it("decreases confidence when evidence contradicts the prior trend", () => {
    const { estimate } = updateEstimate("s99", "integer_operations", prior, [event({ correct: false })]);
    expect(estimate.confidence).toBeLessThan(prior.confidence);
  });

  it("labels the trend from the realized delta", () => {
    const up = updateEstimate("s99", "integer_operations", prior, [event({ correct: true })]);
    expect(up.estimate.trend).toBe("rising");
    const down = updateEstimate("s99", "integer_operations", prior, [event({ correct: false })]);
    expect(down.estimate.trend).toBe("falling");
  });

  it("leaves the estimate untouched with no events", () => {
    const { estimate, delta } = updateEstimate("s99", "integer_operations", prior, []);
    expect(estimate).toEqual(prior);
    expect(delta.delta).toBe(0);
  });
});
