/**
 * Submission simulation orchestrator — Person C owned.
 *
 * Runs the second half of the loop against a run frozen at `variants_ready`:
 *   submissions.received → assessment.completed → student.models.updated
 *   → lesson.plan.ready → approval.requested
 * in exactly the CONTRACTS.md event order, through Person D's event bus.
 * Deterministic: re-simulating a run resets it to the seed and produces the
 * identical result.
 */
import type { ReviewItem, RoomId, RunState } from "@/contracts";
import { demoAnswerKey, demoSubmissions } from "@/seed/submissions";
import type { SeedSubmission } from "@/seed/submissions";
import { runAssessmentAgent } from "@/server/agents/assessment";
import { runClassroomEvolutionAgent } from "@/server/agents/classroomEvolution";
import { runLessonPlanner } from "@/server/agents/lessonPlanner";
import { trace } from "@/server/platform/guildWorkflow";
import { hydrateRunMastery, writeRunMastery } from "@/server/platform/rocketRideDataPlane";
import {
  drainEventsToStream,
  ingestSubmissions,
  recordAgentRun,
  runPipeline,
} from "@/server/sponsorBridge";
import { emitRunEvent, getOrCreateRun, resetRun, saveRun } from "./runProvider";

export async function simulateSubmissions(runId: string): Promise<RunState> {
  let run = await getOrCreateRun(runId);
  if (run.status === "assessed" || run.status === "planned") {
    // Re-running the demo: rebuild from seed so the outcome is identical.
    resetRun(runId);
    run = await getOrCreateRun(runId);
  }

  if (run.assignment.source === "curriculum") {
    await hydrateRunMastery(run);
  }

  const { submissions, answerKey } = run.assignment.source === "curriculum"
    ? curriculumSubmissions(run)
    : { submissions: [...demoSubmissions], answerKey: demoAnswerKey };
  submissions.sort((a, b) => a.student_id.localeCompare(b.student_id));
  emitRunEvent(run, "submissions.received", "assessment_agent", {
    simulated: true,
    submission_count: submissions.length,
    submission_ids: submissions.map((submission) => submission.submission_id),
  });

  // Every submission enters as a live activity record on the run's topic.
  // This is the most honest use of a streaming layer in the project: real
  // student work arriving as it happens, rather than a timer.
  await ingestSubmissions(
    run.run_id,
    submissions.map((submission) => ({
      student_id: submission.student_id,
      submission_id: submission.submission_id,
    })),
  );
  await drainEventsToStream(run);

  // 1. Assessment Agent grades every submission.
  const assessment = runAssessmentAgent(run, submissions, answerKey);
  run.assessments = assessment.result.assessments;
  run.review_queue.push(...assessment.result.review_items);
  run.status = "assessed";
  const needsReview = assessment.result.assessments.filter(
    (entry) => entry.review_state === "needs_review",
  );
  emitRunEvent(run, "assessment.completed", "assessment_agent", {
    assessment_count: assessment.result.assessments.length,
    assessments: assessment.result.assessments,
    needs_review_count: needsReview.length,
    needs_review_students: needsReview.map((entry) => entry.student_id),
    misconception_counts: countMisconceptions(run),
    average_score: averageScore(run),
  });
  await trace({
    run_id: run.run_id,
    actor: "assessment_agent",
    action: "assessment.completed",
    evidence_refs: assessment.evidence_refs,
    review_gate: assessment.human_review_required,
    details: { needs_review_students: needsReview.map((entry) => entry.student_id) },
  });
  // Guild opens the low-confidence gate here when the agent asks for review.
  await recordAgentRun(run.run_id, "assessment_agent", assessment);
  await drainEventsToStream(run);

  // 2. Classroom Evolution Agent updates mastery, scaffolding, and rooms.
  const previousRoomByStudent = roomByStudent(run);
  const evolution = runClassroomEvolutionAgent(run);
  // Store the assessed, run-scoped values (not just the initial baselines)
  // so the FalkorDB graph is evidence of learning in this lesson.
  await writeRunMastery(run);
  const finalMoves = finalRoomMoves(run, previousRoomByStudent);
  emitRunEvent(run, "student.models.updated", "classroom_evolution_agent", {
    updated_student_count: run.students.length,
    students: run.students,
    rooms: run.rooms,
    moves: finalMoves,
    mastery_deltas: evolution.result.mastery_deltas,
    scaffolding_changes: evolution.result.scaffolding_changes,
    room_changes: evolution.result.room_changes,
    room_sizes: evolution.result.room_sizes,
    class_concept_averages: evolution.result.class_concept_averages,
    largest_gap_concept: evolution.result.largest_gap_concept,
  });
  await trace({
    run_id: run.run_id,
    actor: "classroom_evolution_agent",
    action: "student.models.updated",
    evidence_refs: evolution.evidence_refs,
  });
  await recordAgentRun(run.run_id, "classroom_evolution_agent", evolution);
  await drainEventsToStream(run);

  // 3. Lesson Planner drafts tomorrow's timeline. The synthesis pipeline runs
  // against the freshly updated classroom state.
  await runPipeline(
    run.run_id,
    "lesson_plan_synthesis",
    "Synthesise tomorrow's teaching plan from the updated classroom state.",
    {
      largest_gap_concept: evolution.result.largest_gap_concept,
      room_sizes: evolution.result.room_sizes,
      class_concept_averages: evolution.result.class_concept_averages,
    },
  );

  const plan = runLessonPlanner(run, evolution.result);
  run.lesson_plan = plan.result;
  run.status = "planned";
  emitRunEvent(run, "lesson.plan.ready", "lesson_planner", {
    lesson_plan: {
      ...plan.result,
      headline: plan.result.whole_class_intervention,
      items: plan.result.timeline.map((step) => ({
        item_id: step.step_id,
        title: step.title,
        room_id: step.audience === "whole_class" ? undefined : step.audience,
        student_ids: [],
        concept_focus: [],
        action: step.description,
        rationale: step.description,
        evidence_refs: step.evidence_refs,
        minutes: step.duration_minutes,
      })),
    },
    whole_class_intervention: plan.result.whole_class_intervention,
    step_count: plan.result.timeline.length,
    first_step: plan.result.timeline[0]?.title,
    approval_state: plan.result.approval_state,
  });

  // 4. Professor approval gates: the drafted plan plus any held grades.
  const planReview: ReviewItem = {
    review_id: "rev-final-plan",
    run_id: run.run_id,
    agent: "lesson_planner",
    review_type: "final_plan",
    subject_id: run.run_id,
    reason: "Tomorrow's lesson plan requires professor approval before publication.",
    evidence_refs: plan.evidence_refs,
    status: "pending",
  };
  run.review_queue.push(planReview);
  await trace({
    run_id: run.run_id,
    actor: "lesson_planner",
    action: "lesson.plan.ready",
    evidence_refs: plan.evidence_refs,
    review_gate: true,
  });
  emitRunEvent(run, "approval.requested", "lesson_planner", {
    review_queue: run.review_queue,
    gates: run.review_queue
      .filter((item) => item.status === "pending")
      .map((item) => ({
        review_id: item.review_id,
        review_type: item.review_type,
        subject_id: item.subject_id,
        reason: item.reason,
      })),
  });

  await recordAgentRun(run.run_id, "lesson_planner", plan);

  saveRun(run);
  await drainEventsToStream(run);
  return run;
}

/**
 * A deterministic, content-neutral classroom rehearsal for newly launched
 * curriculum. It evaluates the generated checks without pretending to know a
 * web-researched answer key; real learner submissions will replace this seam.
 */
function curriculumSubmissions(run: RunState): { submissions: SeedSubmission[]; answerKey: Record<string, string> } {
  const answerKey = Object.fromEntries(run.assignment.questions.map((question) => [question.question_id, "complete"]));
  const submissions = run.students.map((student, studentIndex) => ({
    submission_id: `sub_${run.run_id}_${student.student_id}`,
    student_id: student.student_id,
    responses: run.assignment.questions.map((question, questionIndex) => {
      const heldForReview = student.student_id === "stu_02" && questionIndex === 0;
      const needsPractice = (studentIndex + questionIndex) % 5 === 0;
      return {
        question_id: question.question_id,
        answer: needsPractice ? "needs revision" : "complete",
        work_shown: heldForReview ? "" : "Student response to the generated comprehension check.",
        ...(heldForReview ? { legibility: "ambiguous" as const } : {}),
      };
    }),
  }));
  return { submissions, answerKey };
}

function countMisconceptions(run: RunState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const assessment of run.assessments) {
    for (const result of assessment.question_results) {
      for (const misconceptionId of result.misconception_ids) {
        counts[misconceptionId] = (counts[misconceptionId] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function averageScore(run: RunState): number {
  if (run.assessments.length === 0) return 0;
  const total = run.assessments.reduce((sum, assessment) => sum + assessment.score, 0);
  return Math.round((total / run.assessments.length) * 100) / 100;
}

function roomByStudent(run: RunState): Map<string, RoomId> {
  const byStudent = new Map<string, RoomId>();
  for (const room of run.rooms) {
    for (const studentId of room.members) {
      byStudent.set(studentId, room.room_id);
    }
  }
  return byStudent;
}

function finalRoomMoves(
  run: RunState,
  previousRoomByStudent: Map<string, RoomId>,
): Array<{ student_id: string; from_room?: RoomId; to_room: RoomId }> {
  return run.rooms.flatMap((room) =>
    room.members.flatMap((studentId) => {
      const from = previousRoomByStudent.get(studentId);
      if (from === room.room_id) return [];
      return [{ student_id: studentId, from_room: from, to_room: room.room_id }];
    }),
  );
}
