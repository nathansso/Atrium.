import type { NextRequest } from "next/server";
import { getSeedStudent } from "@/seed/students";
import { apiError, apiOk, toApiError } from "@/server/http";
import { findLatestRunWithStudent, getRun } from "@/server/runStore";
import { buildStudentCard } from "@/server/views";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/:studentId?run_id=...
 *
 * Private contextual card: mastery, current barriers, room placement with its
 * rationale, delivery layer, and the overlay applied to this student's copy of
 * the assignment. Falls back to the latest run containing the student, and to
 * a run-less card when no run has been created yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;
    const student = getSeedStudent(studentId);
    if (!student) {
      return apiError(
        "student_not_found",
        `No student with id "${studentId}".`,
        404,
      );
    }

    const requestedRunId = request.nextUrl.searchParams.get("run_id");
    if (requestedRunId && !getRun(requestedRunId)) {
      return apiError("run_not_found", `No run with id "${requestedRunId}".`, 404);
    }

    const run = requestedRunId
      ? getRun(requestedRunId)
      : findLatestRunWithStudent(studentId);

    return apiOk(buildStudentCard(student, run));
  } catch (error) {
    return toApiError(error);
  }
}
