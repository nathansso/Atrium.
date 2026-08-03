import { beforeEach, describe, expect, it } from "vitest";
import { supportIds } from "@/contracts";
import { seedStudents } from "@/seed/students";
import {
  directivesForSupports,
  SUPPORT_RULES,
} from "@/server/agents/accessibility";
import { createRun } from "@/server/coreLoop";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";

describe("accessibility agent", () => {
  beforeEach(async () => {
    resetRunStore();
    resetLocalEvents();
  });

  it("creates one delivery layer per student", async () => {
    const { state } = await createRun();
    expect(state.accessibility?.layers).toHaveLength(seedStudents.length);
  });

  it("asserts it is a delivery layer only", async () => {
    const { state } = await createRun();
    expect(state.accessibility?.invariants).toEqual({
      delivery_layer_only: true,
      objectives_preserved: true,
      support_changes_require_human: true,
    });
    for (const layer of state.accessibility?.layers ?? []) {
      expect(layer.objectives_modified).toBe(false);
      expect(layer.academic_content_removed).toBe(false);
      expect(layer.support_change_proposed).toBe(false);
    }
  });

  it("derives every directive from a documented support", async () => {
    const { state } = await createRun();
    const supportsById = new Map(
      seedStudents.map((s) => [s.student_id, new Set(s.supports)]),
    );
    for (const layer of state.accessibility?.layers ?? []) {
      const documented = supportsById.get(layer.student_id)!;
      expect(layer.directives).toHaveLength(documented.size);
      for (const directive of layer.directives) {
        expect(documented.has(directive.derived_from)).toBe(true);
        expect(directive.directive).toBe(
          SUPPORT_RULES[directive.derived_from].directive,
        );
      }
    }
  });

  it("routes every support to a presentation, pacing, visibility, or sequencing channel", async () => {
    const directives = directivesForSupports([...supportIds]);
    expect(directives).toHaveLength(supportIds.length);
    for (const directive of directives) {
      expect([
        "presentation",
        "pacing",
        "visibility",
        "sequencing",
      ]).toContain(directive.channel);
    }
  });

  it("leaves students without documented supports on standard delivery", async () => {
    const { state } = await createRun();
    const noSupportStudents = seedStudents
      .filter((s) => s.supports.length === 0)
      .map((s) => s.student_id);
    expect(noSupportStudents.length).toBeGreaterThan(0);

    for (const studentId of noSupportStudents) {
      const layer = (state.accessibility?.layers ?? []).find(
        (l) => l.student_id === studentId,
      );
      expect(layer).toBeDefined();
      expect(layer?.directives).toEqual([]);
      expect(layer?.notes).toContain("No documented supports");
    }
  });

  it("does not keep a student with documented supports out of Summit", async () => {
    const { state } = await createRun();
    const summit = state.rooms.find((r) => r.room_id === "summit")!;
    const withSupports = summit.members.filter(
      (id) =>
        (seedStudents.find((s) => s.student_id === id)?.supports.length ?? 0) > 0,
    );
    expect(withSupports.length).toBeGreaterThan(0);
  });
});
