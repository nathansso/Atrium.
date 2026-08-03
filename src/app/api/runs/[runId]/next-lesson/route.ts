import { NextResponse } from "next/server";
import { getRun } from "@/server/runStore";
import { findRecordByLessonRun } from "@/server/curriculum/store";

/** Return the next cited lesson assignment, unlocked after the current run is planned. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const record = findRecordByLessonRun(runId);
  const currentRun = getRun(runId);
  if (!record?.launch || !currentRun) {
    return NextResponse.json({ error: { message: "No curriculum lesson sequence for this run." } }, { status: 404 });
  }
  const position = record.launch.lesson_runs.findIndex((lesson) => lesson.run_id === runId);
  const next = record.launch.lesson_runs[position + 1] ?? null;
  return NextResponse.json({
    run_id: runId,
    current: record.launch.lesson_runs[position],
    next,
    total_lessons: record.launch.lesson_runs.length,
    can_advance: currentRun.status === "planned",
  });
}
