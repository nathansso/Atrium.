/**
 * RocketRide data plane.
 *
 * Application code reaches FalkorDB and LaserData through this boundary only.
 * RocketRide owns the read/write workflow: it enriches requests with pipeline
 * work when needed, persists classroom memory, and emits the event spine.
 * The provider adapters remain an internal implementation detail.
 */
import { misconceptionConcept, type AgentEvent, type ConceptId, type Room, type RunState, type Student } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type { PipelineRequest, PipelineResult } from "@/server/adapters";
import type { CurriculumEvidence, GraphNeighborhood } from "@/server/adapters";
import { syncClassroomGraph } from "@/server/memory/classroomGraph";

const PUBLISHED_KEY = "__atrium_rocketride_published__";

function publishedCounts(): Map<string, number> {
  const store = globalThis as Record<string, unknown>;
  store[PUBLISHED_KEY] ??= new Map<string, number>();
  return store[PUBLISHED_KEY] as Map<string, number>;
}

export async function executePipeline<T>(request: PipelineRequest): Promise<PipelineResult<T>> {
  return getAdapters().rocketride.run<T>(request);
}

/** Temporary port for upload helpers while they migrate to executePipeline(). */
export function rocketRidePipelinePort() {
  return getAdapters().rocketride;
}

/** Persist all newly appended workflow events to LaserData in run order. */
export async function publishRunEvents(state: RunState): Promise<number> {
  const laser = getAdapters().laser;
  const sent = publishedCounts().get(state.run_id) ?? 0;
  const pending = state.events.slice(sent);
  if (!pending.length) return 0;
  await laser.ensureTopic(state.run_id);
  for (const event of pending) await laser.publish(event as AgentEvent);
  publishedCounts().set(state.run_id, state.events.length);
  return pending.length;
}

export async function writeSubmissionActivities(
  runId: string,
  submissions: Array<{ student_id: string; submission_id: string }>,
): Promise<number> {
  const laser = getAdapters().laser;
  await laser.ensureTopic(runId);
  for (const submission of submissions) {
    await laser.ingestActivity({ run_id: runId, student_id: submission.student_id, kind: "submission", payload: { submission_id: submission.submission_id }, observed_at: new Date().toISOString() });
  }
  return submissions.length;
}

export async function readGraph(runId: string, nodeId: string, concepts: ConceptId[]) {
  const graph = getAdapters().falkordb;
  const primary = await graph.neighborhood(nodeId, 2);
  const sharedBarriers = await graph.findSharedBarriers(concepts, { runId, minGroupSize: 1 });
  return { primary, sharedBarriers };
}

export async function readRelatedNeighborhoods(studentIds: string[]) {
  const graph = getAdapters().falkordb;
  return Promise.all([...studentIds].sort().map((studentId) => graph.neighborhood(studentId, 2)));
}

/** Write and read research citations through the RocketRide-owned data plane. */
export async function writeCurriculumEvidence(evidence: CurriculumEvidence): Promise<number> {
  return getAdapters().falkordb.saveCurriculumEvidence(evidence);
}

export async function readCurriculumEvidence(runId: string): Promise<GraphNeighborhood> {
  return getAdapters().falkordb.curriculumEvidence(runId);
}

/** Materialise assessment findings before graph reads; writes stay in the data plane. */
export async function materializeAssessmentMemory(run: RunState): Promise<void> {
  const graph = getAdapters().falkordb;
  for (const assessment of run.assessments) {
    const existing = await graph.neighborhood(assessment.student_id, 1);
    const seen = new Set(existing.edges.filter((edge) => edge.kind === "EXHIBITED" && edge.props.run_id === run.run_id).map((edge) => edge.to));
    for (const result of assessment.question_results) {
      for (const misconceptionId of result.misconception_ids) {
        if (seen.has(misconceptionId)) continue;
        await graph.recordMisconception({ student_id: assessment.student_id, misconception_id: misconceptionId, concept_id: misconceptionConcept[misconceptionId], run_id: run.run_id, evidence_refs: [result.evidence] });
        seen.add(misconceptionId);
      }
    }
  }
}

/** Save the graph state produced by a run; no route or agent writes FalkorDB directly. */
export async function writeRoomFormation(runId: string, rooms: Room[]): Promise<number> {
  return getAdapters().falkordb.saveRoomFormation(runId, rooms);
}

/** Build and read the current graph-backed barriers through the data plane. */
export async function syncClassroomMemory(input: {
  runId: string;
  students: Student[];
  concepts: ConceptId[];
  updatedAt: string;
}) {
  return syncClassroomGraph({ falkordb: getAdapters().falkordb, ...input });
}

export function resetDataPlaneProgress(runId?: string): void {
  const counts = publishedCounts();
  if (runId) counts.delete(runId); else counts.clear();
}
