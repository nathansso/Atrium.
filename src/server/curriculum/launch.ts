import {
  assignmentSchema,
  type Assignment,
  type CurriculumDraft,
  type CurriculumLaunch,
  type CurriculumLaunchRequest,
} from "@/contracts";
import { createRunFromRequest } from "@/server/coreLoop";
import { trace } from "@/server/platform/guildWorkflow";
import { writeCurriculumEvidence } from "@/server/platform/rocketRideDataPlane";
import { CurriculumNotFoundError } from "./service";
import { getRecord, setLaunch } from "./store";

export class CurriculumLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurriculumLaunchError";
  }
}

/** Project approved, cited learning chunks into the existing Assignment seam. */
export function assignmentFromCurriculum(draft: CurriculumDraft, teachingIntent?: string): Assignment {
  const effectiveIntent = teachingIntent ?? draft.teaching_intent ?? `Teach ${draft.topic} through cited learning chunks.`;
  return assignmentSchema.parse({
    assignment_id: `asg_${draft.draft_id}`,
    title: `${draft.topic} learning plan`,
    course: draft.audience,
    source: "curriculum",
    teaching_intent: effectiveIntent,
    professor_constraints: [
      "Preserve the approved curriculum objectives and source citations.",
      "Do not replace cited content with unsupported claims.",
    ],
    objectives: draft.concepts.map((concept) => ({
      objective_id: `obj_${concept.concept_id}`,
      statement: concept.summary,
      concept: concept.concept_id,
    })),
    questions: draft.chunks.map((chunk) => ({
      question_id: `chunk_${chunk.chunk_id}`,
      prompt: `${chunk.body}\n\nCheck for understanding: ${chunk.comprehension_check.prompt}`,
      concepts: chunk.concept_ids,
      difficulty: 0.5,
      expected_minutes: chunk.duration_minutes,
      objective_id: chunk.objective_ids[0] ?? `obj_${chunk.concept_ids[0]}`,
    })),
  });
}

/** A curriculum chunk is a teachable lesson with its own check and run. */
function assignmentFromLesson(
  draft: CurriculumDraft,
  chunk: CurriculumDraft["chunks"][number],
  position: number,
  teachingIntent?: string,
): Assignment {
  const effectiveIntent = teachingIntent ?? draft.teaching_intent ?? `Teach ${draft.topic} through cited learning chunks.`;
  return assignmentSchema.parse({
    assignment_id: `asg_${draft.draft_id}_${chunk.chunk_id}`,
    title: `${draft.topic} · Lesson ${position + 1}: ${chunk.title}`,
    course: draft.audience,
    source: "curriculum",
    teaching_intent: effectiveIntent,
    professor_constraints: ["Preserve the approved lesson and its source citations."],
    objectives: draft.concepts
      .filter((concept) => chunk.concept_ids.includes(concept.concept_id))
      .map((concept) => ({ objective_id: `obj_${concept.concept_id}`, statement: concept.summary, concept: concept.concept_id })),
    questions: [{
      question_id: `chunk_${chunk.chunk_id}`,
      prompt: `${chunk.body}\n\nCheck for understanding: ${chunk.comprehension_check.prompt}`,
      concepts: chunk.concept_ids,
      difficulty: 0.5,
      expected_minutes: chunk.duration_minutes,
      objective_id: chunk.objective_ids[0] ?? `obj_${chunk.concept_ids[0]}`,
    }],
  });
}

export async function launchCurriculum(
  draftId: string,
  request: CurriculumLaunchRequest,
  now: () => string = () => new Date().toISOString(),
): Promise<{ launch: CurriculumLaunch; assignment: Assignment; run_id: string; reused: boolean }> {
  const record = getRecord(draftId);
  if (!record) throw new CurriculumNotFoundError(draftId);
  if (record.draft.approval_state !== "approved") {
    throw new CurriculumLaunchError("Only an educator-approved curriculum draft can be launched.");
  }
  if (record.launch) {
    const firstChunk = record.draft.chunks[0];
    return {
      launch: record.launch,
      assignment: assignmentFromLesson(record.draft, firstChunk, 0, record.launch.teaching_intent),
      run_id: record.launch.run_id,
      reused: true,
    };
  }

  const lessonRuns = [] as CurriculumLaunch["lesson_runs"];
  const assignments: Assignment[] = [];
  for (const [position, chunk] of record.draft.chunks.entries()) {
    const assignment = assignmentFromLesson(record.draft, chunk, position, request.teaching_intent);
    const outcome = await createRunFromRequest({ assignment, demo_mode: false, teaching_intent: assignment.teaching_intent });
    assignments.push(assignment);
    lessonRuns.push({ chunk_id: chunk.chunk_id, title: chunk.title, position, assignment_id: assignment.assignment_id, run_id: outcome.state.run_id });
    await writeCurriculumEvidence({
      run_id: outcome.state.run_id,
      draft_id: draftId,
      assignment_id: assignment.assignment_id,
      topic: record.draft.topic,
      sources: record.draft.sources.filter((source) => chunk.citations.includes(source.source_id)),
      chunks: [{ chunk_id: chunk.chunk_id, title: chunk.title, concept_ids: chunk.concept_ids, citations: chunk.citations }],
    });
  }
  const firstLesson = lessonRuns[0];
  const assignment = assignments[0];
  const launch: CurriculumLaunch = {
    draft_id: draftId,
    assignment_id: firstLesson.assignment_id,
    run_id: firstLesson.run_id,
    launched_by: request.launched_by,
    launched_at: now(),
    teaching_intent: assignment.teaching_intent,
    lesson_runs: lessonRuns,
  };
  setLaunch(draftId, launch);
  await trace({
    run_id: launch.run_id,
    actor: "professor",
    action: "curriculum.launched",
    details: { draft_id: draftId, assignment_id: assignment.assignment_id, launched_by: request.launched_by },
  });
  return { launch, assignment, run_id: launch.run_id, reused: false };
}
