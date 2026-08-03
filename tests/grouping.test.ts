import { beforeEach, describe, expect, it } from "vitest";
import { supportIds, type StudentContext, type SupportId } from "@/contracts";
import { demoAssignment } from "@/seed/assignment";
import { seedStudents } from "@/seed/students";
import { analyzeAssignment } from "@/server/agents/assignmentArchitect";
import { buildStudentContext } from "@/server/agents/studentMemory";
import {
  buildGroupingPlan,
  fragmentationPenalty,
  MIN_ROOM_SIZE,
  supportCompatibility,
  EXCLUDED_SIGNALS,
  ROOM_PROFILES,
} from "@/server/agents/grouping";
import { createRun } from "@/server/coreLoop";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";

const analysis = analyzeAssignment(demoAssignment);
const contexts = seedStudents.map((s) => buildStudentContext(s, analysis));

function placementMap(plan: ReturnType<typeof buildGroupingPlan>) {
  return Object.fromEntries(
    plan.placements.map((p) => [p.student_id, p.room_id]),
  );
}

describe("grouping agent", () => {
  beforeEach(async () => {
    resetRunStore();
    resetLocalEvents();
  });

  it("creates three or four rooms, each at or above the minimum size", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    expect(plan.rooms.length).toBeGreaterThanOrEqual(3);
    expect(plan.rooms.length).toBeLessThanOrEqual(4);
    for (const room of plan.rooms) {
      expect(room.members.length).toBeGreaterThanOrEqual(MIN_ROOM_SIZE);
    }
  });

  it("places every student exactly once", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    const members = plan.rooms.flatMap((r) => r.members);
    expect(members).toHaveLength(contexts.length);
    expect(new Set(members).size).toBe(contexts.length);
    expect(plan.placements).toHaveLength(contexts.length);
  });

  it("groups by academic barrier: each room's members share its signature misconception", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    const contextById = new Map(contexts.map((c) => [c.student_id, c]));

    for (const room of plan.rooms) {
      const profile = ROOM_PROFILES.find((p) => p.room_id === room.room_id)!;
      if (profile.signature_misconceptions.length === 0) continue;

      for (const memberId of room.members) {
        const member = contextById.get(memberId)!;
        const shared = member.active_misconceptions.filter((m) =>
          profile.signature_misconceptions.includes(m),
        );
        expect(shared.length).toBeGreaterThan(0);
      }
    }
  });

  it("sends only barrier-free, high-mastery students to Summit", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    const summit = plan.rooms.find((r) => r.room_id === "summit")!;
    const contextById = new Map(contexts.map((c) => [c.student_id, c]));

    for (const memberId of summit.members) {
      const member = contextById.get(memberId)!;
      expect(member.mean_mastery).toBeGreaterThanOrEqual(0.85);
      expect(member.active_misconceptions).toEqual([]);
    }
  });

  it("never lets a documented support move a student", async () => {
    const baseline = placementMap(buildGroupingPlan(contexts, analysis));

    // Every student gets every documented support.
    const allSupports: StudentContext[] = contexts.map((c) => ({
      ...c,
      documented_supports: [...supportIds] as SupportId[],
    }));
    expect(placementMap(buildGroupingPlan(allSupports, analysis))).toEqual(
      baseline,
    );

    // No student has any documented support.
    const noSupports: StudentContext[] = contexts.map((c) => ({
      ...c,
      documented_supports: [],
    }));
    expect(placementMap(buildGroupingPlan(noSupports, analysis))).toEqual(
      baseline,
    );

    // Supports reversed across the cohort.
    const swapped: StudentContext[] = contexts.map((c, i) => ({
      ...c,
      documented_supports: contexts[contexts.length - 1 - i].documented_supports,
    }));
    expect(placementMap(buildGroupingPlan(swapped, analysis))).toEqual(baseline);
  });

  it("scores support_compatibility identically across every room", async () => {
    for (const context of contexts) {
      const scores = ROOM_PROFILES.map((p) =>
        supportCompatibility(p.room_id, context.documented_supports),
      );
      expect(new Set(scores).size).toBe(1);
      expect(scores[0]).toBe(1);
    }
  });

  it("declares the signals it used and the labels it refused to read", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    expect(plan.grouping_signals_used.length).toBeGreaterThan(0);
    expect(plan.excluded_signals).toEqual(EXCLUDED_SIGNALS);
    for (const excluded of ["diagnosis", "accommodation_label", "documented_support"]) {
      expect(plan.excluded_signals).toContain(excluded);
    }
  });

  it("never names a room after a diagnosis or an accommodation", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    const banned = [
      ...supportIds,
      "iep",
      "504",
      "disability",
      "diagnosis",
      "sped",
      "remedial",
      "low",
      "slow",
    ];
    for (const room of plan.rooms) {
      const haystack = `${room.name} ${room.dominant_barrier}`.toLowerCase();
      for (const term of banned) {
        expect(haystack).not.toContain(term.replace(/_/g, " "));
      }
    }
  });

  it("cites evidence in every room explanation and placement", async () => {
    const plan = buildGroupingPlan(contexts, analysis);
    for (const room of plan.rooms) {
      expect(room.explanation).toContain("Evidence:");
      expect(room.evidence_refs.length).toBeGreaterThan(0);
    }
    for (const placement of plan.placements) {
      expect(placement.rationale.length).toBeGreaterThan(0);
      expect(placement.evidence_refs.length).toBeGreaterThan(0);
    }
  });

  it("applies a fragmentation penalty only above the soft capacity", async () => {
    expect(fragmentationPenalty(3, 4)).toBe(0);
    expect(fragmentationPenalty(4, 4)).toBe(0);
    expect(fragmentationPenalty(5, 4)).toBeGreaterThan(0);
    expect(fragmentationPenalty(6, 4)).toBeGreaterThan(fragmentationPenalty(5, 4));
  });

  it("dissolves a room that cannot reach the minimum size", async () => {
    // A cohort with a single Summit-eligible student: Summit cannot hold and
    // that student must be rehoused rather than left alone in a room.
    const trimmed = contexts.filter(
      (c) => !["stu_09", "stu_13"].includes(c.student_id),
    );
    const plan = buildGroupingPlan(trimmed, analysis);

    for (const room of plan.rooms) {
      expect(room.members.length).toBeGreaterThanOrEqual(MIN_ROOM_SIZE);
    }
    expect(plan.rooms.flatMap((r) => r.members)).toHaveLength(trimmed.length);
    expect(plan.rooms.length).toBeGreaterThanOrEqual(3);
  });

  it("emits groups.proposed with room membership", async () => {
    const { state } = await createRun();
    const event = state.events.find((e) => e.event_type === "groups.proposed")!;
    expect(event.source_agent).toBe("grouping_agent");
    expect(event.payload.room_count).toBe(state.rooms.length);
    expect(event.payload.excluded_signals).toEqual(EXCLUDED_SIGNALS);
  });
});
