import { curriculumLaunchRequestSchema } from "@/contracts";
import { launchCurriculum } from "@/server/curriculum";
import { apiOk, readJsonBody, toApiError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const { draftId } = await params;
    const body = curriculumLaunchRequestSchema.parse(await readJsonBody(request));
    const outcome = await launchCurriculum(draftId, body);
    return apiOk({ ...outcome, status: "variants_ready" }, outcome.reused ? 200 : 201);
  } catch (error) {
    return toApiError(error);
  }
}
