/**
 * POST /api/runs/:runId/approve-plan — Person C owned.
 *
 * Stores the professor's approval on the lesson plan and appends to the
 * audit trail. Body (optional): { "approved_by": string, "note": string }.
 */
import { approvePlan } from "@/server/submissions";
import type { ApprovePlanInput } from "@/server/submissions";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  let input: ApprovePlanInput = {};
  try {
    const body = (await request.json()) as ApprovePlanInput | null;
    if (body && typeof body === "object") {
      input = {
        ...(typeof body.approved_by === "string" ? { approved_by: body.approved_by } : {}),
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      };
    }
  } catch {
    // Empty or non-JSON body is fine — approval works without one.
  }

  const result = approvePlan(runId, input);
  if (!result.ok) {
    const status = result.error === "run_not_found" ? 404 : 409;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ run: result.run, audit: result.audit });
}
