import {
  createRunRequestSchema,
  runStateSchema,
  type AgentResult,
  type Assignment,
  type AssignmentAnalysis,
  type AccessibilityPlan,
  type CreateRunRequest,
  type GroupingPlan,
  type ReviewItem,
  type RunState,
  type StudentContextBundle,
  type VariantBundle,
} from "@/contracts";
import { getSeedAssignment } from "@/seed/assignment";
import { getSeedStudents } from "@/seed/students";
import { createAgentContext } from "./agentRuntime";
import { DeterministicClock, stableStringify } from "./deterministic";
import { emitEvent } from "./eventBridge";
import {
  appendRunEvent,
  nextEventSequence,
  nextRunId,
  putRun,
  runClock,
  setRunStatus,
  updateRun,
} from "./runStore";
import { runAssignmentArchitect } from "./agents/assignmentArchitect";
import { runStudentMemory } from "./agents/studentMemory";
import { runGrouping } from "./agents/grouping";
import { runAccessibility } from "./agents/accessibility";
import {
  runAssignmentCurator,
  runAssignmentCuratorWithPipeline,
} from "./agents/assignmentCurator";
import { getAdapters } from "./adapters";
import {
  extractUploadedAssignment,
  type MotionProvenance,
} from "./motion/assignmentMotion";
import {
  drainEventsToStream,
  recordAgentRun,
  registerAgents,
  runPipeline,
} from "./sponsorBridge";

/**
 * The deterministic upload-to-variants loop.
 *
 * assignment.uploaded
 *   -> assignment.concepts.extracted   (Assignment Architect)
 *   -> student.context.ready           (Student Memory Agent)
 *   -> groups.proposed                 (Grouping Agent)
 *   -> accessibility.layers.ready      (Accessibility Agent)
 *   -> assignment.variants.ready       (Assignment Curator)
 *
 * Everything downstream of `assignment.variants.ready` belongs to Person C.
 */

export class AssignmentNotFoundError extends Error {
  constructor(assignmentId: string) {
    super(`No seed assignment with id "${assignmentId}"`);
    this.name = "AssignmentNotFoundError";
  }
}

export class AssignmentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentInputError";
  }
}

export type CoreLoopResults = {
  architect: AgentResult<AssignmentAnalysis>;
  memory: AgentResult<StudentContextBundle>;
  grouping: AgentResult<GroupingPlan>;
  accessibility: AgentResult<AccessibilityPlan>;
  curator: AgentResult<VariantBundle>;
};

export type CreateRunOutcome = {
  state: RunState;
  results: CoreLoopResults;
};

type CoreLoopBeforeCurator = {
  runId: string;
  assignment: Assignment;
  ctx: ReturnType<typeof createAgentContext>;
  architect: AgentResult<AssignmentAnalysis>;
  memory: AgentResult<StudentContextBundle>;
  grouping: AgentResult<GroupingPlan>;
  accessibility: AgentResult<AccessibilityPlan>;
  /** Per-room prose from the RocketRide variant pipeline, folded in by `finishCoreRun`. */
  adaptationSummaries: Map<string, string>;
};

function reviewItemFor(
  runId: string,
  result: AgentResult<unknown>,
  index: number,
  reason: string,
): ReviewItem {
  return {
    review_id: `rev_${runId}_${String(index).padStart(2, "0")}`,
    run_id: runId,
    agent: result.agent,
    review_type: "final_plan",
    subject_id: runId,
    reason,
    evidence_refs: result.evidence_refs.slice(0, 8),
    status: "pending",
  };
}

async function beginCoreRun(input: {
  assignment: Assignment;
  demoMode: boolean;
  teachingIntent: string;
  extractionProvenance?: MotionProvenance;
  /**
   * Whether this path owns the RocketRide calls. The seeded path drives the
   * pipeline from here; the upload path already crosses the RocketRide seam in
   * `createRunFromRequest` (extraction) and `runAssignmentCuratorWithPipeline`
   * (variants), so running them here too would bill the pipeline twice for the
   * same work and desync the task-token audit trail.
   */
  runSponsorPipelines?: boolean;
}): Promise<CoreLoopBeforeCurator> {
  const {
    assignment,
    demoMode,
    teachingIntent,
    extractionProvenance,
    runSponsorPipelines = true,
  } = input;
  const students = getSeedStudents();

  const clock = new DeterministicClock();
  const runId = nextRunId({
    assignment_id: assignment.assignment_id,
    teaching_intent: teachingIntent,
    demo_mode: demoMode,
    student_fingerprint: stableStringify(students.map((s) => s.student_id)),
  });

  const initialState: RunState = {
    run_id: runId,
    status: "created",
    created_at: clock.peek(),
    demo_mode: demoMode,
    teaching_intent: teachingIntent,
    assignment,
    concepts: [],
    students,
    student_contexts: [],
    rooms: [],
    grouping: null,
    accessibility: null,
    variants: [],
    assessments: [],
    review_queue: [],
    events: [],
  };

  putRun(initialState, clock);

  // The professor hands the document over. The Architect is the owning agent
  // for this event because it is the first consumer.
  const uploadEvent = emitEvent({
    event_type: "assignment.uploaded",
    run_id: runId,
    source_agent: "assignment_architect",
    timestamp: runClock(runId).next(),
    sequence: nextEventSequence(runId),
    payload: {
      assignment_id: assignment.assignment_id,
      title: assignment.title,
      course: assignment.course,
      source: assignment.source,
      question_count: assignment.questions.length,
      objective_count: assignment.objectives.length,
      teaching_intent: teachingIntent,
      demo_mode: demoMode,
      assignment,
      ...(extractionProvenance
        ? { extraction_pipeline: extractionProvenance }
        : {}),
    },
  });
  const uploaded = appendRunEvent(runId, uploadEvent);
  setRunStatus(runId, "analyzing");

  // Sponsors join here. Registration and the first publish happen before any
  // agent runs so the stream carries the upload event, not just its effects.
  await registerAgents();
  await drainEventsToStream(uploaded);

  const ctx = createAgentContext(runId);

  // RocketRide reads the assignment. The architect's deterministic analysis
  // stays authoritative for concepts — a pipeline that hallucinated a fifth
  // concept would break the seeded demo — but the pipeline genuinely executes
  // and every execution is audited with its task token.
  if (runSponsorPipelines) {
    await runPipeline(
      runId,
      "concept_extraction",
      `Extract the concepts, objectives and constraints from "${assignment.title}".`,
      {
        assignment_id: assignment.assignment_id,
        question_count: assignment.questions.length,
        teaching_intent: teachingIntent,
      },
    );
  }

  const architect = runAssignmentArchitect(
    ctx,
    assignment,
    extractionProvenance,
  );
  updateRun(runId, (state) => ({
    ...state,
    concepts: architect.result.concepts,
  }));
  await recordAgentRun(runId, "assignment_architect", architect);
  await drainEventsToStream(updateRun(runId, (state) => state));

  const memory = runStudentMemory(ctx, students, architect.result);
  updateRun(runId, (state) => ({
    ...state,
    student_contexts: memory.result.contexts,
  }));
  await recordAgentRun(runId, "student_memory_agent", memory);
  await drainEventsToStream(updateRun(runId, (state) => state));

  const grouping = runGrouping(ctx, memory.result.contexts, architect.result);
  updateRun(runId, (state) => ({
    ...state,
    rooms: grouping.result.rooms,
    grouping: grouping.result,
    status: "grouped",
  }));
  await recordAgentRun(runId, "grouping_agent", grouping);
  await drainEventsToStream(updateRun(runId, (state) => state));

  const accessibility = runAccessibility(
    ctx,
    memory.result.contexts,
    grouping.result,
  );
  updateRun(runId, (state) => ({
    ...state,
    accessibility: accessibility.result,
  }));
  await recordAgentRun(runId, "accessibility_agent", accessibility);
  await drainEventsToStream(updateRun(runId, (state) => state));

  // One pipeline execution per room. Unlike concept extraction, this output is
  // consumed: the adaptation summary the pipeline returns is the prose a
  // professor reads in the morph panel.
  const adaptationSummaries = new Map<string, string>();
  if (runSponsorPipelines) {
    for (const room of grouping.result.rooms) {
      const generated = await runPipeline<{ adaptation_summary?: string }>(
        runId,
        "variant_generation",
        `Adapt "${assignment.title}" for a room whose shared barrier is: ${room.dominant_barrier}.`,
        {
          room_id: room.room_id,
          focus_concepts: room.focus_concepts,
          base_adaptation: room.base_adaptation,
          member_count: room.members.length,
        },
      );
      const summary = generated.output?.adaptation_summary;
      if (typeof summary === "string" && summary.length > 0) {
        adaptationSummaries.set(room.room_id, summary);
      }
    }
  }

  return {
    runId,
    assignment,
    ctx,
    architect,
    memory,
    grouping,
    accessibility,
    adaptationSummaries,
  };
}

async function finishCoreRun(
  before: CoreLoopBeforeCurator,
  curator: AgentResult<VariantBundle>,
): Promise<CreateRunOutcome> {
  const { runId, architect, memory, grouping, accessibility, adaptationSummaries } =
    before;

  const results: CoreLoopResults = {
    architect,
    memory,
    grouping,
    accessibility,
    curator,
  };

  const reviewQueue: ReviewItem[] = [];
  const reviewReasons: Array<[AgentResult<unknown>, string]> = [
    [architect, "Assignment analysis did not cover every declared objective."],
    [memory, "Stored mastery confidence is too low for at least one student."],
    [grouping, "Room placements are not decisively separated."],
    [accessibility, "Accessibility delivery layer needs professor confirmation."],
    [curator, "A generated variant requires objective and rigour review."],
  ];
  for (const [result, reason] of reviewReasons) {
    if (result.human_review_required) {
      reviewQueue.push(
        reviewItemFor(runId, result, reviewQueue.length + 1, reason),
      );
    }
  }

  // Fold each room's generated adaptation summary into the variant a
  // professor actually reads. When the pipeline is unavailable the curator's
  // deterministic rationale stands on its own, so the demo never shows a gap.
  const variants = curator.result.variants.map((variant) => {
    const summary = adaptationSummaries.get(variant.room_id);
    return summary
      ? { ...variant, rationale: `${variant.rationale} ${summary}` }
      : variant;
  });

  const finalState = updateRun(runId, (state) => ({
    ...state,
    variants,
    review_queue: [...state.review_queue, ...reviewQueue],
    status: "variants_ready",
  }));

  await recordAgentRun(runId, "assignment_curator", curator);
  await drainEventsToStream(finalState);

  // Fail loudly rather than serve a state that violates the shared contract.
  return { state: runStateSchema.parse(finalState), results };
}

/** Deterministic seeded path retained for tests and classroom replay. */
export async function createRun(
  request: CreateRunRequest = {},
): Promise<CreateRunOutcome> {
  const parsed = createRunRequestSchema.parse(request);
  const demoMode = parsed.demo_mode ?? true;

  const assignment = demoMode
    ? getSeedAssignment(parsed.assignment_id)
    : (parsed.assignment ?? getSeedAssignment(parsed.assignment_id));

  if (!assignment) {
    throw new AssignmentNotFoundError(parsed.assignment_id ?? "unknown");
  }

  const before = await beginCoreRun({
    assignment,
    demoMode,
    teachingIntent: parsed.teaching_intent ?? assignment.teaching_intent,
  });

  const curator = runAssignmentCurator(
    before.ctx,
    assignment,
    before.grouping.result,
    before.accessibility.result,
  );

  return finishCoreRun(before, curator);
}

/**
 * API path for a real upload. Both extraction and variant generation cross the
 * RocketRide seam; mock mode still consumes the submitted text deterministically.
 */
export async function createRunFromRequest(
  request: CreateRunRequest = {},
): Promise<CreateRunOutcome> {
  const parsed = createRunRequestSchema.parse(request);
  const hasUploadedInput = Boolean(parsed.assignment_text || parsed.assignment);
  if (!hasUploadedInput) return await createRun(parsed);
  if (parsed.demo_mode === true) {
    throw new AssignmentInputError(
      "demo_mode=true cannot be combined with an uploaded assignment.",
    );
  }

  const { rocketride } = getAdapters();
  let assignment = parsed.assignment;
  let extractionProvenance: MotionProvenance | undefined;

  if (!assignment) {
    if (!parsed.assignment_text) {
      throw new AssignmentInputError("assignment_text is required for an upload.");
    }
    const extracted = await extractUploadedAssignment(rocketride, {
      assignmentText: parsed.assignment_text,
      title: parsed.title,
      teachingIntent: parsed.teaching_intent,
    });
    assignment = extracted.assignment;
    extractionProvenance = extracted.provenance;
  }

  const before = await beginCoreRun({
    assignment,
    demoMode: false,
    teachingIntent: parsed.teaching_intent ?? assignment.teaching_intent,
    extractionProvenance,
    // The upload path owns its own RocketRide calls — see `runSponsorPipelines`.
    runSponsorPipelines: false,
  });
  const curator = await runAssignmentCuratorWithPipeline(
    before.ctx,
    assignment,
    before.grouping.result,
    before.accessibility.result,
    rocketride,
  );
  return finishCoreRun(before, curator);
}
