import {
  misconceptionConcept,
  type ConceptId,
  type Student,
} from "@/contracts";
import type {
  FalkorGraphAdapter,
  SharedBarrierGroup,
} from "@/server/adapters";

type SyncClassroomGraphInput = {
  falkordb: FalkorGraphAdapter;
  runId: string;
  students: Student[];
  concepts: ConceptId[];
  updatedAt: string;
};

/**
 * Materialize the current assignment's relevant classroom memory, then run
 * FalkorDB's load-bearing Student -> Misconception -> Concept traversal.
 */
export async function syncClassroomGraph({
  falkordb,
  runId,
  students,
  concepts,
  updatedAt,
}: SyncClassroomGraphInput): Promise<SharedBarrierGroup[]> {
  const relevantConcepts = new Set(concepts);

  await falkordb.ensureSchema();
  await falkordb.upsertMastery(
    students.flatMap((student) =>
      concepts.map((conceptId) => ({
        student_id: student.student_id,
        concept_id: conceptId,
        mastery: student.mastery[conceptId],
        updated_at: updatedAt,
      })),
    ),
  );

  for (const student of students) {
    for (const misconceptionId of student.recent_patterns) {
      const conceptId = misconceptionConcept[misconceptionId];
      if (!relevantConcepts.has(conceptId)) continue;

      await falkordb.recordMisconception({
        student_id: student.student_id,
        misconception_id: misconceptionId,
        concept_id: conceptId,
        run_id: runId,
        evidence_refs: [
          `student:${student.student_id}#pattern:${misconceptionId}`,
        ],
      });
    }
  }

  return falkordb.findSharedBarriers(concepts, {
    runId,
    minGroupSize: 2,
  });
}
