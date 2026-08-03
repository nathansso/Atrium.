import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoAssignment } from "@/seed/assignment";
import { seedStudents } from "@/seed/students";
import { getAdapters, resetAdapters } from "@/server/adapters";
import { analyzeAssignment } from "@/server/agents/assignmentArchitect";
import { buildGroupingPlan } from "@/server/agents/grouping";
import { buildStudentContext } from "@/server/agents/studentMemory";
import { syncClassroomGraph } from "./classroomGraph";

const analysis = analyzeAssignment(demoAssignment);
const contexts = seedStudents.map((student) =>
  buildStudentContext(student, analysis),
);

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPONSOR_MODE", "");
  await resetAdapters();
});

describe("classroom graph integration", () => {
  it("seeds relevant memory and returns shared graph barriers", async () => {
    const { falkordb } = getAdapters();
    const groups = await syncClassroomGraph({
      falkordb,
      runId: "run_graph_seed",
      students: seedStudents,
      concepts: analysis.concepts.map((concept) => concept.concept_id),
      updatedAt: "2026-08-03T10:00:00.000Z",
    });

    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].path_explanation).toContain("EXHIBITED");
    expect(
      await falkordb.getMastery("stu_01", "integer_operations"),
    ).toHaveLength(1);
  });

  it("changes room membership when the graph misconception path changes", async () => {
    const { falkordb } = getAdapters();
    for (const studentId of ["stu_01", "stu_04"]) {
      await falkordb.recordMisconception({
        student_id: studentId,
        misconception_id: "partial_distribution",
        concept_id: "distributive_property",
        run_id: "run_graph_change",
        evidence_refs: [`submission:${studentId}`],
      });
    }

    const forgeGroups = await falkordb.findSharedBarriers(
      ["distributive_property"],
      { runId: "run_graph_change" },
    );
    const graphPlan = buildGroupingPlan(contexts, analysis, forgeGroups);
    const baselinePlan = buildGroupingPlan(contexts, analysis);

    const roomFor = (
      plan: ReturnType<typeof buildGroupingPlan>,
      studentId: string,
    ) => plan.placements.find((item) => item.student_id === studentId)!;

    expect(roomFor(baselinePlan, "stu_01").room_id).toBe("ember");
    expect(roomFor(graphPlan, "stu_01").room_id).toBe("forge");
    expect(roomFor(graphPlan, "stu_04").room_id).toBe("forge");
    expect(roomFor(graphPlan, "stu_01").evidence_refs).toContain(
      "falkordb:shared-barrier:partial_distribution:distributive_property",
    );
    expect(roomFor(graphPlan, "stu_01").rationale).toContain(
      "FalkorDB confirmed",
    );
    expect(graphPlan.grouping_signals_used).toContain(
      "falkordb_shared_barrier_path",
    );
  });
});
