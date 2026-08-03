/** GET /api/curriculum/:draftId — fetch a stored curriculum draft. */
import { getRecord } from "@/server/curriculum";
import { apiError, apiOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const record = getRecord(draftId);
  if (!record) {
    return apiError("draft_not_found", `No curriculum draft with id "${draftId}".`, 404);
  }
  return apiOk({ draft: record.draft, approval: record.approval, launch: record.launch });
}
