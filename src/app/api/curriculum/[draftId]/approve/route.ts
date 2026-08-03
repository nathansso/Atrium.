/**
 * POST /api/curriculum/:draftId/approve — record the educator's decision.
 *
 * Body (optional): { "approved_by": string, "note": string, "reject": boolean }.
 * Approval is the gate between web synthesis and student-facing work.
 */
import { curriculumApprovalRequestSchema } from "@/contracts";
import { approveCurriculum } from "@/server/curriculum";
import { apiOk, readJsonBody, toApiError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = curriculumApprovalRequestSchema.parse(await readJsonBody(request));
    const { draft, approval } = await approveCurriculum(draftId, body);
    return apiOk({ draft, approval });
  } catch (error) {
    return toApiError(error);
  }
}
