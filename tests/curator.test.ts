import { beforeEach, describe, expect, it } from "vitest";
import { demoAssignment } from "@/seed/assignment";
import { createRun } from "@/server/coreLoop";
import {
  checkObjectivePreservation,
  checkRigor,
  RIGOR_TOLERANCE,
} from "@/server/agents/assignmentCurator";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";

describe("assignment curator", () => {
  beforeEach(async () => {
    resetRunStore();
    resetLocalEvents();
  });

  it("produces one variant per room", async () => {
    const { state } = await createRun();
    expect(state.variants.map((v) => v.room_id).sort()).toEqual(
      state.rooms.map((r) => r.room_id).sort(),
    );
  });

  it("preserves every objective in every variant", async () => {
    const { state } = await createRun();
    for (const variant of state.variants) {
      expect(variant.objective_preservation.preserved).toBe(true);
      expect(variant.objective_preservation.missing_objective_ids).toEqual([]);
      expect(variant.objective_preservation.checks).toHaveLength(
        demoAssignment.objectives.length,
      );
      for (const check of variant.objective_preservation.checks) {
        expect(check.variant_item_count).toBeGreaterThanOrEqual(
          check.original_item_count,
        );
      }
    }
  });

  it("keeps the same item count as the original assignment", async () => {
    const { state } = await createRun();
    for (const variant of state.variants) {
      expect(variant.items).toHaveLength(demoAssignment.questions.length);
      expect(variant.items.map((i) => i.source_question_id)).toEqual(
        demoAssignment.questions.map((q) => q.question_id),
      );
    }
  });

  it("never lowers rigour and stays inside tolerance", async () => {
    const { state } = await createRun();
    for (const variant of state.variants) {
      expect(variant.rigor_check.within_tolerance).toBe(true);
      expect(variant.rigor_check.delta).toBeGreaterThanOrEqual(0);
      expect(Math.abs(variant.rigor_check.delta)).toBeLessThanOrEqual(
        RIGOR_TOLERANCE,
      );
    }
  });

  it("changes the pathway, not the prompt", async () => {
    const { state } = await createRun();
    const promptById = new Map(
      demoAssignment.questions.map((q) => [q.question_id, q.prompt]),
    );
    for (const variant of state.variants) {
      for (const item of variant.items) {
        expect(item.prompt).toBe(promptById.get(item.source_question_id));
        expect(item.scaffold.length).toBeGreaterThan(0);
      }
    }

    // Remediation rooms differ from each other in scaffolding, not in content.
    const scaffoldSignatures = state.variants.map((v) =>
      v.items.map((i) => i.scaffold).join("|"),
    );
    expect(new Set(scaffoldSignatures).size).toBe(state.variants.length);
  });

  it("raises rigour for Summit and holds it steady elsewhere", async () => {
    const { state } = await createRun();
    for (const variant of state.variants) {
      if (variant.room_id === "summit") {
        expect(variant.rigor_check.delta).toBeGreaterThan(0);
      } else {
        expect(variant.rigor_check.delta).toBe(0);
      }
    }
  });

  it("attaches a presentation-only overlay for every room member", async () => {
    const { state } = await createRun();
    for (const variant of state.variants) {
      const room = state.rooms.find((r) => r.room_id === variant.room_id)!;
      expect(variant.student_overlays.map((o) => o.student_id)).toEqual(
        room.members,
      );
      for (const overlay of variant.student_overlays) {
        expect(overlay.changes_item_content).toBe(false);
      }
    }
  });

  it("fails the objective check when an objective is dropped", async () => {
    const items = [
      {
        item_id: "x1",
        source_question_id: "q1",
        objective_id: "obj_integer_operations",
        concepts: ["integer_operations" as const],
        prompt: "Simplify: -7 + (-4) - (-9)",
        scaffold: "",
        difficulty: 0.35,
        expected_minutes: 2,
      },
    ];
    const check = checkObjectivePreservation(demoAssignment, items);
    expect(check.preserved).toBe(false);
    expect(check.missing_objective_ids).toContain("obj_distributive_property");
  });

  it("fails the rigour check when the bar is lowered", async () => {
    const easier = demoAssignment.questions.map((q) => ({
      item_id: `easy_${q.question_id}`,
      source_question_id: q.question_id,
      objective_id: q.objective_id,
      concepts: q.concepts,
      prompt: q.prompt,
      scaffold: "",
      difficulty: Math.max(0, q.difficulty - 0.2),
      expected_minutes: q.expected_minutes,
    }));
    const check = checkRigor(demoAssignment, easier);
    expect(check.within_tolerance).toBe(false);
    expect(check.delta).toBeLessThan(0);
    expect(check.notes).toContain("may not lower the bar");
  });

  it("emits assignment.variants.ready with both checks passing", async () => {
    const { state } = await createRun();
    const event = state.events.find(
      (e) => e.event_type === "assignment.variants.ready",
    )!;
    expect(event.source_agent).toBe("assignment_curator");
    expect(event.payload.all_objectives_preserved).toBe(true);
    expect(event.payload.all_rigor_checks_passed).toBe(true);
  });
});
