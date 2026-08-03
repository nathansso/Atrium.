import { beforeEach, describe, expect, it } from "vitest";
import { researchRequestSchema } from "@/contracts";
import { createMockFirecrawlAdapter } from "@/server/adapters/firecrawlMock";
import { getAdapters, resetAdapters } from "@/server/adapters";
import { getRun, resetRunStore } from "@/server/runStore";
import { findRecordByLessonRun } from "./store";
import { simulateSubmissions } from "@/server/submissions";
import { approveCurriculum, launchCurriculum, researchCurriculum, resetCurriculumStore } from ".";

describe("approved curriculum launch", () => {
  beforeEach(async () => {
    resetCurriculumStore();
    resetRunStore();
    await resetAdapters();
  });

  it("projects a Machine Learning draft into an ordered, cited lesson sequence", async () => {
    const researched = await researchCurriculum(
      researchRequestSchema.parse({
        topic: "machine learning",
        audience: "high school",
        teaching_intent: "Compare supervised and unsupervised learning responsibly.",
        max_sources: 5,
      }),
      { firecrawl: createMockFirecrawlAdapter(), now: () => "2026-08-03T12:00:00.000Z" },
    );
    await approveCurriculum(researched.draft.draft_id, { approved_by: "educator-demo", reject: false });

    const launched = await launchCurriculum(
      researched.draft.draft_id,
      { launched_by: "educator-demo" },
      () => "2026-08-03T12:01:00.000Z",
    );

    expect(launched.assignment.source).toBe("curriculum");
    expect(launched.assignment.objectives.map((objective) => objective.concept)).toContain("ai:what-is-ai");
    expect(launched.run_id).toMatch(/^run_/);
    expect(launched.launch.lesson_runs).toHaveLength(researched.draft.chunks.length);
    expect(launched.launch.lesson_runs.length).toBeGreaterThan(1);
    const evidence = await getAdapters().falkordb.curriculumEvidence(launched.run_id);
    expect(evidence.nodes.some((node) => node.kind === "Source")).toBe(true);
    expect(evidence.edges.some((edge) => edge.kind === "CITES")).toBe(true);

    const completed = await simulateSubmissions(launched.run_id);
    expect(completed.status).toBe("planned");
    expect(completed.lesson_plan?.whole_class_intervention).toContain("cited example");
    expect(completed.events.map((event) => event.event_type)).toContain("lesson.plan.ready");
    const sequence = findRecordByLessonRun(launched.run_id)?.launch?.lesson_runs;
    expect(sequence?.[1]?.run_id).toMatch(/^run_/);
    expect(getRun(launched.run_id)?.status).toBe("planned");

    const repeated = await launchCurriculum(researched.draft.draft_id, { launched_by: "another-educator" });
    expect(repeated.reused).toBe(true);
    expect(repeated.run_id).toBe(launched.run_id);
  });
});
