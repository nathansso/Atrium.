/**
 * POST /api/runs/:runId/simulate-submissions — Person C owned.
 *
 * Runs prepared submissions through Assessment → Classroom Evolution →
 * Lesson Planner and returns the updated RunState. Unknown run ids bootstrap
 * the deterministic seed run (fallback until Person B's POST /api/runs lands).
 */
import { simulateSubmissions } from "@/server/submissions";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const run = await simulateSubmissions(runId);
  return Response.json(run);
}
