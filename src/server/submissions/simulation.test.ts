/**
 * End-to-end simulation tests for the Person C demo path, pinning the
 * required demo outcomes from docs/PERSON_C_BACKEND_ASSESSMENT_EVOLUTION.md.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eventTypes } from "@/contracts";
import type { RunState } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import { getGuildTraces } from "@/server/platform/guildWorkflow";
import { getRunEvents, resetEventBus } from "@/server/events";
import { createRun } from "@/server/coreLoop";
import { approvePlan } from "./approvePlan";
import { resetRun } from "./runProvider";
import { simulateSubmissions } from "./simulateSubmissions";

const RUN_ID = "test-run";
const EMBER_SEED_MEMBERS = ["stu_01", "stu_02", "stu_03", "stu_04", "stu_05"];

function domainSnapshot(run: RunState): string {
  // Events carry wall-clock timestamps; everything else must be identical.
  return JSON.stringify({ ...run, events: undefined });
}

describe("simulateSubmissions", () => {
  beforeEach(async () => {
    resetRun(RUN_ID);
    resetEventBus();
  });

  it("emits every contract event in CONTRACTS.md order", async () => {
    await simulateSubmissions(RUN_ID);
    const sequence = getRunEvents(RUN_ID).map((event) => event.event_type);
    expect(sequence).toEqual([...eventTypes]);
  });

  it("emits assessment-phase events from the owning agents", async () => {
    await simulateSubmissions(RUN_ID);
    const bySource = Object.fromEntries(
      getRunEvents(RUN_ID).map((event) => [event.event_type, event.source_agent]),
    );
    expect(bySource["submissions.received"]).toBe("assessment_agent");
    expect(bySource["assessment.completed"]).toBe("assessment_agent");
    expect(bySource["student.models.updated"]).toBe("classroom_evolution_agent");
    expect(bySource["lesson.plan.ready"]).toBe("lesson_planner");
    expect(bySource["approval.requested"]).toBe("lesson_planner");
  });

  it("grades all 15 students deterministically and reaches planned status", async () => {
    const run = await simulateSubmissions(RUN_ID);
    expect(run.status).toBe("planned");
    expect(run.assessments).toHaveLength(15);
    for (const assessment of run.assessments) {
      expect(assessment.reasoning_trace.length).toBeGreaterThan(0);
      expect(assessment.question_results).toHaveLength(6);
    }
  });

  it("puts exactly one low-confidence grade in the review queue (Dev, stu_02)", async () => {
    const run = await simulateSubmissions(RUN_ID);
    const gradeReviews = run.review_queue.filter(
      (item) => item.review_type === "low_confidence_grade",
    );
    expect(gradeReviews).toHaveLength(1);
    expect(gradeReviews[0].subject_id).toBe("stu_02");
    expect(gradeReviews[0].status).toBe("pending");

    const dev = run.assessments.find((assessment) => assessment.student_id === "stu_02");
    expect(dev?.review_state).toBe("needs_review");
    expect(dev?.confidence).toBeLessThan(0.7);
    for (const other of run.assessments.filter((assessment) => assessment.student_id !== "stu_02")) {
      expect(other.review_state).toBe("auto_approved");
      expect(other.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("shows the Ember intervention succeeding: 4 of 5 improve integer operations", async () => {
    const seedBaseline = (await createRun({ demo_mode: true })).state;
    const run = await simulateSubmissions(RUN_ID);

    const improvements = EMBER_SEED_MEMBERS.map((studentId) => {
      const before = seedBaseline.students.find((student) => student.student_id === studentId)!
        .mastery.integer_operations.score;
      const after = run.students.find((student) => student.student_id === studentId)!
        .mastery.integer_operations.score;
      return { studentId, improved: after > before };
    });

    expect(improvements.filter((entry) => entry.improved)).toHaveLength(4);
    expect(improvements.find((entry) => entry.studentId === "stu_02")?.improved).toBe(false);
  });

  it("moves Maya (stu_01) from high scaffolding to medium", async () => {
    const run = await simulateSubmissions(RUN_ID);
    const maya = run.students.find((student) => student.student_id === "stu_01");
    expect(maya?.scaffolding_level).toBe(2);

    const event = getRunEvents(RUN_ID).find((entry) => entry.event_type === "student.models.updated");
    const changes = event?.payload.scaffolding_changes as Array<{
      student_id: string;
      from_label: string;
      to_label: string;
    }>;
    const mayaChange = changes.find((change) => change.student_id === "stu_01");
    expect(mayaChange?.from_label).toBe("high");
    expect(mayaChange?.to_label).toBe("medium");
  });

  it("leaves Forge as the strictly largest room and largest remaining gap", async () => {
    const run = await simulateSubmissions(RUN_ID);
    const sizes = Object.fromEntries(run.rooms.map((room) => [room.room_id, room.members.length]));
    expect(sizes.forge).toBeGreaterThan(sizes.ember);
    expect(sizes.forge).toBeGreaterThan(sizes.harbor);
    expect(sizes.forge).toBeGreaterThan(sizes.summit);

    const event = getRunEvents(RUN_ID).find((entry) => entry.event_type === "student.models.updated");
    expect(event?.payload.largest_gap_concept).toBe("distributive_property");
  });

  it("keeps every room populated and Ember shrunk after the intervention", async () => {
    const run = await simulateSubmissions(RUN_ID);
    for (const room of run.rooms) {
      expect(room.members.length).toBeGreaterThanOrEqual(2);
    }
    const ember = run.rooms.find((room) => room.room_id === "ember")!;
    expect(ember.members.length).toBeLessThan(EMBER_SEED_MEMBERS.length);
    expect(ember.members).toContain("stu_02");
  });

  it("plans tomorrow in the required order with evidence on every step", async () => {
    const run = await simulateSubmissions(RUN_ID);
    const plan = run.lesson_plan!;
    expect(plan.approval_state).toBe("pending");

    expect(plan.timeline[0].audience).toBe("whole_class");
    expect(plan.timeline[0].title.toLowerCase()).toContain("distribution mini-lesson");
    expect(plan.timeline[1].title).toBe("Room rotations");
    expect(plan.timeline.slice(2).map((step) => step.audience)).toEqual([
      "ember",
      "forge",
      "harbor",
      "summit",
    ]);
    for (const step of plan.timeline) {
      expect(step.evidence_refs.length).toBeGreaterThan(0);
    }
    expect(plan.whole_class_intervention.toLowerCase()).toContain("distribution");
  });

  it("is deterministic across a reset and across re-simulation", async () => {
    const first = domainSnapshot(await simulateSubmissions(RUN_ID));

    // Re-simulate on a planned run: orchestrator resets to seed internally.
    const second = domainSnapshot(await simulateSubmissions(RUN_ID));
    expect(second).toBe(first);

    resetRun(RUN_ID);
    const third = domainSnapshot(await simulateSubmissions(RUN_ID));
    expect(third).toBe(first);
  });

  it("records review gates for the held grade and the final plan", async () => {
    await simulateSubmissions(RUN_ID);
    const traces = await getGuildTraces(RUN_ID);
    expect(traces.some((trace) => trace.action === "guild.agent_run:needs_review")).toBe(true);
    expect(traces.some((trace) => trace.action === "guild.approval_requested:final_plan")).toBe(true);
  });
});

describe("approvePlan", () => {
  beforeEach(async () => {
    resetRun(RUN_ID);
    resetEventBus();
  });

  it("returns run_not_found for unknown runs", async () => {
    const result = await approvePlan("missing-run");
    expect(result).toEqual({ ok: false, error: "run_not_found" });
  });

  it("approves the plan, resolves the plan gate, and traces the decision", async () => {
    await simulateSubmissions(RUN_ID);
    const result = await approvePlan(RUN_ID, { approved_by: "Prof. Rivera", note: "Ship it" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.run.lesson_plan?.approval_state).toBe("approved");

    const planItem = result.run.review_queue.find((item) => item.review_type === "final_plan");
    expect(planItem?.status).toBe("approved");

    // Approving the plan never publishes the held low-confidence grade.
    const gradeItem = result.run.review_queue.find(
      (item) => item.review_type === "low_confidence_grade",
    );
    expect(gradeItem?.status).toBe("pending");
    const dev = result.run.assessments.find((assessment) => assessment.student_id === "stu_02");
    expect(dev?.review_state).toBe("needs_review");

    const traces = await getGuildTraces(RUN_ID);
    const approval = traces.find((entry) => entry.action === "lesson_plan.approved");
    expect(approval?.actor).toBe("professor");
    expect(approval?.details?.approved_by).toBe("Prof. Rivera");
  });

  it("resolves the final_plan gate on Guild's side, not just the local review item", async () => {
    await simulateSubmissions(RUN_ID);

    // This suite reuses RUN_ID across tests without resetting adapter state,
    // so earlier tests may have already left resolved gates for this run —
    // filter to the fresh pending one rather than assuming the first match.
    const gatesBefore = await getAdapters().guild.listApprovals(RUN_ID);
    const planGateBefore = gatesBefore.find(
      (gate) => gate.gate_type === "final_plan" && gate.status === "pending",
    );
    expect(planGateBefore?.status).toBe("pending");

    await approvePlan(RUN_ID, { approved_by: "Prof. Rivera" });

    const gatesAfter = await getAdapters().guild.listApprovals(RUN_ID);
    const planGateAfter = gatesAfter.find((gate) => gate.gate_id === planGateBefore?.gate_id);
    expect(planGateAfter?.status).toBe("approved");
    expect(planGateAfter?.resolved_at).not.toBeNull();

    // The held low-confidence grade gate is untouched by approving the plan.
    const gradeGate = gatesAfter.find((gate) => gate.gate_type === "low_confidence_grade");
    expect(gradeGate?.status).toBe("pending");
  });
});
