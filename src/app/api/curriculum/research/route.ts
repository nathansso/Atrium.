/**
 * POST /api/curriculum/research — source-grounded curriculum preview.
 *
 * Deliberately separate from POST /api/runs: it produces a cited, reviewable
 * draft for the educator and never starts a classroom run. Approval (and, in a
 * later phase, launch) are distinct steps.
 */
import { researchRequestSchema } from "@/contracts";
import { researchCurriculum } from "@/server/curriculum";
import { apiOk, readJsonBody, toApiError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  try {
    const body = researchRequestSchema.parse(await readJsonBody(request));
    const outcome = await researchCurriculum(body);
    return apiOk(
      {
        draft: outcome.draft,
        agent_result: outcome.agent_result,
        provider: outcome.provider,
        degraded: outcome.degraded,
      },
      201,
    );
  } catch (error) {
    return toApiError(error);
  }
}
