import { conceptIds, misconceptionConcept, type ConceptId, type RunState } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type { GraphNeighborhood } from "@/server/adapters/types";
import { apiError, apiOk, toApiError } from "@/server/http";
import { getRun } from "@/server/runStore";
import { graphForRun } from "@/world/graph";

export const dynamic = "force-dynamic";

const CYPHER = `MATCH path = (student:Student)-[:EXHIBITED]->(barrier:Misconception)-[:BLOCKS]->(concept:Concept)
WHERE student.id IN $studentIds AND concept.id IN $conceptIds
RETURN path`;

/** GET /api/runs/:runId/graph — FalkorDB neighborhood used by the world constellation. */
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const run = getRun(runId);
    if (!run) return apiError("run_not_found", `No run with id "${runId}".`, 404);

    const url = new URL(request.url);
    const requestedConcepts = url.searchParams.getAll("concept");
    const concepts = (requestedConcepts.length > 0 ? requestedConcepts : [...conceptIds])
      .filter((id): id is ConceptId => conceptIds.includes(id as ConceptId));
    if (concepts.length === 0) {
      return apiError("invalid_concept", "At least one known concept is required.", 400);
    }

    const falkordb = getAdapters().falkordb;
    await hydrateGraph(run, falkordb);
    const nodeId = url.searchParams.get("nodeId") ?? run.students[0]?.student_id;
    if (!nodeId) return apiOk({ run_id: runId, nodes: [], edges: [], shared_barriers: [], cypher: CYPHER });

    const primary = await falkordb.neighborhood(nodeId, 2);
    const sharedBarriers = await falkordb.findSharedBarriers(concepts, { runId, minGroupSize: 1 });
    const relatedStudentIds = new Set(sharedBarriers.flatMap((group) => group.student_ids));
    for (const assessment of run.assessments) relatedStudentIds.add(assessment.student_id);
    relatedStudentIds.delete(nodeId);
    const related = await Promise.all(
      [...relatedStudentIds].sort().map((studentId) => falkordb.neighborhood(studentId, 2)),
    );

    const merged = graphForRun(mergeNeighborhoods([primary, ...related]), runId);
    return apiOk({ run_id: runId, ...merged, shared_barriers: sharedBarriers, cypher: CYPHER });
  } catch (error) {
    return toApiError(error);
  }
}

async function hydrateGraph(run: RunState, falkordb: ReturnType<typeof getAdapters>["falkordb"]): Promise<void> {
  if (run.assessments.length === 0) return;
  // ponytail: lazy hydration keeps this lane isolated; move it to the assessment write path when that lane owns adapter persistence.
  for (const assessment of run.assessments) {
    const existing = await falkordb.neighborhood(assessment.student_id, 1);
    const existingMisconceptions = new Set(
      existing.edges
        .filter((edge) => edge.kind === "EXHIBITED" && edge.props.run_id === run.run_id)
        .map((edge) => edge.to),
    );
    for (const result of assessment.question_results) {
      for (const misconceptionId of result.misconception_ids) {
        if (existingMisconceptions.has(misconceptionId)) continue;
        await falkordb.recordMisconception({
          student_id: assessment.student_id,
          misconception_id: misconceptionId,
          concept_id: misconceptionConcept[misconceptionId],
          run_id: run.run_id,
          evidence_refs: [result.evidence],
        });
        existingMisconceptions.add(misconceptionId);
      }
    }
  }
}

function mergeNeighborhoods(neighborhoods: GraphNeighborhood[]): GraphNeighborhood {
  const nodes = new Map<string, GraphNeighborhood["nodes"][number]>();
  const edges = new Map<string, GraphNeighborhood["edges"][number]>();
  for (const neighborhood of neighborhoods) {
    for (const node of neighborhood.nodes) nodes.set(node.id, node);
    for (const edge of neighborhood.edges) edges.set(`${edge.from}:${edge.kind}:${edge.to}`, edge);
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) =>
      `${a.from}:${a.kind}:${a.to}`.localeCompare(`${b.from}:${b.kind}:${b.to}`),
    ),
  };
}