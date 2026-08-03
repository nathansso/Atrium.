import type { NextRequest } from "next/server";
import { createRunRequestSchema } from "@/contracts";
import { createRunFromRequest } from "@/server/coreLoop";
import { apiOk, readJsonBody, toApiError } from "@/server/http";
import { listRuns } from "@/server/runStore";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

/**
 * POST /api/runs
 *
 * Body (all optional):
 *   { assignment_id?, teaching_intent?, demo_mode?, assignment? }
 *
 * Runs the full deterministic core loop and returns the resulting run state
 * plus the five agent envelopes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = createRunRequestSchema.parse(await readJsonBody(request));
    const { state, results } = await createRunFromRequest(body);

    return apiOk(
      {
        run_id: state.run_id,
        state,
        agent_results: results,
      },
      201,
    );
  } catch (error) {
    return toApiError(error);
  }
}

/** GET /api/runs — run index, useful for the demo reset flow. */
export async function GET() {
  try {
    return apiOk({
      runs: listRuns().map((run) => ({
        run_id: run.run_id,
        status: run.status,
        created_at: run.created_at,
        assignment_id: run.assignment.assignment_id,
        room_count: run.rooms.length,
        student_count: run.students.length,
        event_count: run.events.length,
      })),
    });
  } catch (error) {
    return toApiError(error);
  }
}
