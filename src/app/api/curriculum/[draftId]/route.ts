/** GET /api/curriculum/:draftId — fetch a stored curriculum draft. */
import { getDraft } from "@/server/curriculum";
import { apiError, apiOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const draft = getDraft(draftId);
  if (!draft) {
    return apiError("draft_not_found", `No curriculum draft with id "${draftId}".`, 404);
  }
  return apiOk({ draft });
}
