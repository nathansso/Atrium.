import type { NextRequest } from "next/server";
import { roomIdSchema } from "@/contracts";
import { apiError, apiOk, toApiError } from "@/server/http";
import { findLatestRunWithRoom, getRun } from "@/server/runStore";
import { buildRoomDetail } from "@/server/views";

export const dynamic = "force-dynamic";

/**
 * GET /api/rooms/:roomId?run_id=...
 *
 * Focus concepts, evidence, members with their placement rationale, and the
 * room's assignment variant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const parsedRoomId = roomIdSchema.safeParse(roomId);
    if (!parsedRoomId.success) {
      return apiError(
        "invalid_room_id",
        `"${roomId}" is not a known room. Expected one of: ember, forge, harbor, summit.`,
        400,
      );
    }

    const requestedRunId = request.nextUrl.searchParams.get("run_id");
    if (requestedRunId && !getRun(requestedRunId)) {
      return apiError("run_not_found", `No run with id "${requestedRunId}".`, 404);
    }

    const run = requestedRunId
      ? getRun(requestedRunId)
      : findLatestRunWithRoom(parsedRoomId.data);

    if (!run) {
      return apiError(
        "room_not_built",
        `No run has built room "${parsedRoomId.data}" yet. Create a run first.`,
        404,
      );
    }

    const room = run.rooms.find((r) => r.room_id === parsedRoomId.data);
    if (!room) {
      return apiError(
        "room_not_built",
        `Run "${run.run_id}" did not build room "${parsedRoomId.data}".`,
        404,
      );
    }

    return apiOk(buildRoomDetail(room, run));
  } catch (error) {
    return toApiError(error);
  }
}
