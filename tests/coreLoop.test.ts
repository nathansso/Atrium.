import { beforeEach, describe, expect, it } from "vitest";
import {
  agentEventSchema,
  agentResultSchema,
  assignmentAnalysisSchema,
  accessibilityPlanSchema,
  groupingPlanSchema,
  runStateSchema,
  studentContextBundleSchema,
  variantBundleSchema,
  type EventType,
} from "@/contracts";
import { createRun, AssignmentNotFoundError } from "@/server/coreLoop";
import { resetLocalEvents, localEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";

const EXPECTED_EVENT_ORDER: EventType[] = [
  "assignment.uploaded",
  "assignment.concepts.extracted",
  "student.context.ready",
  "groups.proposed",
  "accessibility.layers.ready",
  "assignment.variants.ready",
];

describe("core loop", () => {
  beforeEach(async () => {
    resetRunStore();
    resetLocalEvents();
  });

  it("runs upload to variants and reaches variants_ready", async () => {
    const { state } = await createRun();

    expect(state.status).toBe("variants_ready");
    expect(state.students).toHaveLength(15);
    expect(state.concepts).toHaveLength(4);
    expect(state.rooms.length).toBeGreaterThanOrEqual(3);
    expect(state.rooms.length).toBeLessThanOrEqual(4);
    expect(state.variants).toHaveLength(state.rooms.length);
    expect(() => runStateSchema.parse(state)).not.toThrow();
  });

  it("emits the six core loop events in order", async () => {
    const { state } = await createRun();

    expect(state.events.map((e) => e.event_type)).toEqual(EXPECTED_EVENT_ORDER);
    for (const event of state.events) {
      expect(() => agentEventSchema.parse(event)).not.toThrow();
      expect(event.run_id).toBe(state.run_id);
    }

    // Event IDs and timestamps are deterministic and strictly increasing.
    const stamps = state.events.map((e) => Date.parse(e.timestamp));
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(new Set(state.events.map((e) => e.event_id)).size).toBe(
      state.events.length,
    );
  });

  it("mirrors every event into the local fallback collector", async () => {
    const { state } = await createRun();
    expect(localEvents(state.run_id).map((e) => e.event_type)).toEqual(
      EXPECTED_EVENT_ORDER,
    );
  });

  it("returns AgentResult envelopes that pass Zod validation", async () => {
    const { results } = await createRun();

    expect(() =>
      agentResultSchema(assignmentAnalysisSchema).parse(results.architect),
    ).not.toThrow();
    expect(() =>
      agentResultSchema(studentContextBundleSchema).parse(results.memory),
    ).not.toThrow();
    expect(() =>
      agentResultSchema(groupingPlanSchema).parse(results.grouping),
    ).not.toThrow();
    expect(() =>
      agentResultSchema(accessibilityPlanSchema).parse(results.accessibility),
    ).not.toThrow();
    expect(() =>
      agentResultSchema(variantBundleSchema).parse(results.curator),
    ).not.toThrow();

    expect(Object.values(results).map((r) => r.agent)).toEqual([
      "assignment_architect",
      "student_memory_agent",
      "grouping_agent",
      "accessibility_agent",
      "assignment_curator",
    ]);
    for (const result of Object.values(results)) {
      expect(result.status).toBe("completed");
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.evidence_refs.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic: same input against a fresh store yields identical output", async () => {
    const first = await createRun();

    resetRunStore();
    resetLocalEvents();
    const second = await createRun();

    expect(second.state.run_id).toBe(first.state.run_id);
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    expect(JSON.stringify(second.results)).toBe(JSON.stringify(first.results));
  });

  it("builds the four named rooms from the seed cohort", async () => {
    const { state } = await createRun();
    expect(state.rooms.map((r) => r.name)).toEqual([
      "Ember",
      "Forge",
      "Harbor",
      "Summit",
    ]);
    expect(state.rooms.flatMap((r) => r.members)).toHaveLength(15);
  });

  it("keeps a clean review queue when every check passes", async () => {
    const { state } = await createRun();
    expect(state.review_queue).toEqual([]);
  });

  it("rejects an unknown assignment id", async () => {
    await expect(createRun({ assignment_id: "asg_does_not_exist" })).rejects.toThrow(
      AssignmentNotFoundError,
    );
  });

  it("accepts a teaching intent override", async () => {
    const { state } = await createRun({ teaching_intent: "Focus on sign accuracy." });
    expect(state.teaching_intent).toBe("Focus on sign accuracy.");
  });
});
