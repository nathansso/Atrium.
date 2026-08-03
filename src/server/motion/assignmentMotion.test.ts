import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdapters } from "@/server/adapters";
import {
  AssignmentInputError,
  createRunFromRequest,
} from "@/server/coreLoop";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";
import {
  buildDeterministicUploadedAssignment,
  inferConcepts,
} from "./assignmentMotion";

describe("assignment motion", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPONSOR_MODE", "mock");
    await resetAdapters();
    resetRunStore();
    resetLocalEvents();
  });

  it("classifies the supported Algebra I concepts from question text", () => {
    expect(inferConcepts("Simplify: -7 + 4")).toEqual([
      "integer_operations",
    ]);
    expect(inferConcepts("Solve: 3(x + 4) = 18")).toEqual([
      "distributive_property",
      "equation_sequencing",
    ]);
    expect(inferConcepts("Combine like terms: 5x + 2x - 3")).toContain(
      "combining_like_terms",
    );
  });

  it("builds a validated upload assignment from the submitted questions", () => {
    const assignment = buildDeterministicUploadedAssignment({
      title: "Integer check",
      teachingIntent: "Check sign reasoning.",
      assignmentText: "1. Simplify: -7 + 4\n2. Simplify: -3 - 8",
    });

    expect(assignment.source).toBe("upload");
    expect(assignment.title).toBe("Integer check");
    expect(assignment.questions.map((question) => question.prompt)).toEqual([
      "Simplify: -7 + 4",
      "Simplify: -3 - 8",
    ]);
    expect(assignment.objectives.map((objective) => objective.concept)).toEqual([
      "integer_operations",
    ]);
  });

  it("routes uploaded text through both RocketRide pipeline tasks", async () => {
    const outcome = await createRunFromRequest({
      title: "Distribution check",
      teaching_intent: "Check whether students distribute before solving.",
      assignment_text:
        "1. Expand: 3(x + 4)\n2. Solve for x: 4(x + 2) = 24",
    });

    expect(outcome.state.demo_mode).toBe(false);
    expect(outcome.state.assignment.source).toBe("upload");
    expect(outcome.state.concepts.map((concept) => concept.concept_id)).toEqual([
      "distributive_property",
      "equation_sequencing",
    ]);
    expect(outcome.state.variants).toHaveLength(outcome.state.rooms.length);
    expect(outcome.results.architect.evidence_refs).toContain(
      "rocketride:mock_0001",
    );
    expect(outcome.results.curator.evidence_refs).toContain(
      "rocketride:mock_0002",
    );

    const extractionEvent = outcome.state.events.find(
      (event) => event.event_type === "assignment.concepts.extracted",
    );
    const variantsEvent = outcome.state.events.find(
      (event) => event.event_type === "assignment.variants.ready",
    );
    expect(extractionEvent?.payload.pipeline).toMatchObject({
      provider: "mock",
      task: "concept_extraction",
      token: "mock_0001",
    });
    expect(variantsEvent?.payload.pipeline).toMatchObject({
      provider: "mock",
      task: "variant_generation",
      token: "mock_0002",
    });
  });

  it("changes concepts and variants when the uploaded assignment changes", async () => {
    const integerRun = await createRunFromRequest({
      title: "Foundations check",
      assignment_text:
        "1. Simplify: -8 + 3\n2. Expand: 2(x + 5)\n3. Solve: x + 4 = 9",
    });
    const equationRun = await createRunFromRequest({
      title: "Equation structure check",
      assignment_text:
        "1. Combine like terms: 3x + 2x\n2. Solve: 3x - 2 = 13\n3. Simplify: -4 + 9",
    });

    expect(integerRun.state.assignment.assignment_id).not.toBe(
      equationRun.state.assignment.assignment_id,
    );
    expect(integerRun.state.concepts.map((concept) => concept.concept_id)).not.toEqual(
      equationRun.state.concepts.map((concept) => concept.concept_id),
    );
    expect(integerRun.state.variants[0].items[0].prompt).toBe(
      "Simplify: -8 + 3",
    );
    expect(equationRun.state.variants[0].items[0].prompt).toBe(
      "Combine like terms: 3x + 2x",
    );
  });

  it("does not silently ignore an upload in explicit demo mode", async () => {
    await expect(
      createRunFromRequest({
        demo_mode: true,
        assignment_text: "1. Solve: x + 1 = 2",
      }),
    ).rejects.toBeInstanceOf(AssignmentInputError);
  });
});
