import { NextResponse } from "next/server";
import { getAdapters } from "@/server/adapters";
import { readCurriculumEvidence } from "@/server/platform/rocketRideDataPlane";

/** GET /api/runs/:runId/evidence — cited Research -> Lesson relationships from FalkorDB. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const graph = await readCurriculumEvidence(runId);
  return NextResponse.json({ run_id: runId, provider: getAdapters().falkordb.info().provider, ...graph });
}
