import { conceptIds, type ConceptId } from "@/contracts";
import type { GraphNeighborhood } from "@/server/adapters/types";
import { materializeAssessmentMemory, readGraph, readRelatedNeighborhoods } from "@/server/platform/rocketRideDataPlane";
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

    await materializeAssessmentMemory(run);
    const nodeId = url.searchParams.get("nodeId") ?? run.students[0]?.student_id;
    if (!nodeId) return apiOk({ run_id: runId, nodes: [], edges: [], shared_barriers: [], cypher: CYPHER });

    const { primary, sharedBarriers } = await readGraph(runId, nodeId, concepts);
    const relatedStudentIds = new Set(sharedBarriers.flatMap((group) => group.student_ids));
    for (const assessment of run.assessments) relatedStudentIds.add(assessment.student_id);
    relatedStudentIds.delete(nodeId);
    const related = await readRelatedNeighborhoods([...relatedStudentIds]);

    const merged = graphForRun(mergeNeighborhoods([primary, ...related]), runId);
    return apiOk({ run_id: runId, ...merged, shared_barriers: sharedBarriers, cypher: CYPHER });
  } catch (error) {
    return toApiError(error);
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
