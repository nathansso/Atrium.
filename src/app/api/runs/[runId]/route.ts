import { apiError, apiOk, toApiError } from "@/server/http";
import { getRun } from "@/server/runStore";

export const dynamic = "force-dynamic";

/** GET /api/runs/:runId — full current run state. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const state = getRun(runId);
    if (!state) {
      return apiError("run_not_found", `No run with id "${runId}".`, 404);
    }
    return apiOk({ run_id: state.run_id, state });
  } catch (error) {
    return toApiError(error);
  }
}
