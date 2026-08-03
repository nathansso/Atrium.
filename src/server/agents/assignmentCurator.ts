import {
  roomNameById,
  variantBundleSchema,
  type AccessibilityPlan,
  type AgentResult,
  type Assignment,
  type AssignmentVariant,
  type ConceptId,
  type GroupingPlan,
  type ObjectiveCheck,
  type ObjectivePreservation,
  type RigorCheck,
  type Room,
  type RoomId,
  type StudentOverlay,
  type VariantBundle,
  type VariantItem,
} from "@/contracts";
import { buildAgentResult, type AgentContext } from "../agentRuntime";
import { clamp, round4 } from "../deterministic";
import type { RocketRidePipelineAdapter } from "../adapters";
import {
  generateRoomVariants,
  type MotionProvenance,
  type VariantGenerationOutput,
} from "../motion/assignmentMotion";

/**
 * Assignment Curator.
 *
 * Consumes: `groups.proposed`, `accessibility.layers.ready`
 * Publishes: `assignment.variants.ready`
 *
 * Produces one variant per room plus per-student presentation overlays. The
 * rule the whole demo rests on: the learning objective stays the same, the
 * pathway changes. Both of those claims are checked, not asserted.
 */
export const AGENT = "assignment_curator" as const;

/** Maximum allowed rigour drift between the original and a variant. */
export const RIGOR_TOLERANCE = 0.1;

/** How much Summit raises item difficulty for extension work. */
export const EXTENSION_DIFFICULTY_LIFT = 0.08;

type ScaffoldLibrary = Partial<Record<ConceptId, string>> & { default: string };

export const ROOM_SCAFFOLDS: Record<RoomId, ScaffoldLibrary> = {
  ember: {
    integer_operations:
      "Place each value on the number line and mark the direction of travel before simplifying, then check that the sign of your answer matches that direction.",
    combining_like_terms:
      "Circle the sign that travels with each term before you group anything.",
    default: "Solve as written and annotate every sign change you make.",
  },
  forge: {
    distributive_property:
      "Draw the area model first and write one product per line, so every term inside the group visibly receives the factor.",
    combining_like_terms:
      "Expand completely, rewrite the expanded line, and only then combine.",
    default: "Solve as written and expand fully before you simplify.",
  },
  harbor: {
    equation_sequencing:
      "Write your undo order before solving: name the outermost operation, then the one you reverse first.",
    combining_like_terms:
      "Simplify each side completely before you begin undoing operations.",
    default: "Solve as written and record the step order you used.",
  },
  summit: {
    default:
      "Justify the step you chose, then confirm the result with a second representation.",
  },
};

/** Summit alternates between justification and error-analysis extensions. */
const SUMMIT_EXTENSIONS = [
  "Justify each step in one sentence, then confirm the result with a second representation.",
  "Predict the most likely error a classmate would make here, explain why it is wrong, and show the correct path.",
];

export function scaffoldFor(
  roomId: RoomId,
  concepts: ConceptId[],
  focusConcepts: ConceptId[],
  itemIndex: number,
): string {
  if (roomId === "summit") {
    return SUMMIT_EXTENSIONS[itemIndex % SUMMIT_EXTENSIONS.length];
  }
  const library = ROOM_SCAFFOLDS[roomId];
  const focusHit = concepts.find(
    (concept) => focusConcepts.includes(concept) && library[concept],
  );
  return focusHit ? library[focusHit]! : library.default;
}

export function buildVariantItems(
  assignment: Assignment,
  room: Room,
): VariantItem[] {
  return assignment.questions.map((question, index) => {
    const difficulty =
      room.room_id === "summit"
        ? round4(clamp(question.difficulty + EXTENSION_DIFFICULTY_LIFT))
        : question.difficulty;

    return {
      item_id: `${room.room_id}_${question.question_id}`,
      source_question_id: question.question_id,
      objective_id: question.objective_id,
      concepts: question.concepts,
      prompt: question.prompt,
      scaffold: scaffoldFor(
        room.room_id,
        question.concepts,
        room.focus_concepts,
        index,
      ),
      difficulty,
      expected_minutes: question.expected_minutes,
    };
  });
}

/**
 * Every declared objective must still be assessed by at least as many items as
 * the original assignment used. A variant that quietly drops an objective, or
 * thins out its coverage, fails here.
 */
export function checkObjectivePreservation(
  assignment: Assignment,
  items: VariantItem[],
): ObjectivePreservation {
  const checks: ObjectiveCheck[] = assignment.objectives.map((objective) => {
    const originalCount = assignment.questions.filter(
      (q) => q.objective_id === objective.objective_id,
    ).length;
    const variantCount = items.filter(
      (item) => item.objective_id === objective.objective_id,
    ).length;
    return {
      objective_id: objective.objective_id,
      statement: objective.statement,
      present_in_variant: variantCount > 0 && variantCount >= originalCount,
      original_item_count: originalCount,
      variant_item_count: variantCount,
    };
  });

  const missing = checks
    .filter((c) => !c.present_in_variant)
    .map((c) => c.objective_id);

  return {
    preserved: missing.length === 0,
    checks,
    missing_objective_ids: missing,
    notes:
      missing.length === 0
        ? "Every declared objective is assessed by at least as many items as the original assignment."
        : `Objectives with reduced or missing coverage: ${missing.join(", ")}.`,
  };
}

/**
 * Rigour may rise (extension) but must never fall: a support pathway that
 * lowers the bar is not a support pathway.
 */
export function checkRigor(
  assignment: Assignment,
  items: VariantItem[],
): RigorCheck {
  const originalRigor = round4(
    assignment.questions.reduce((sum, q) => sum + q.difficulty, 0) /
      assignment.questions.length,
  );
  const variantRigor = round4(
    items.reduce((sum, item) => sum + item.difficulty, 0) / items.length,
  );
  const delta = round4(variantRigor - originalRigor);
  const withinTolerance = delta >= 0 && Math.abs(delta) <= RIGOR_TOLERANCE;

  return {
    original_rigor: originalRigor,
    variant_rigor: variantRigor,
    delta,
    tolerance: RIGOR_TOLERANCE,
    within_tolerance: withinTolerance,
    notes:
      delta === 0
        ? "Rigour is identical to the original. The pathway changed, the bar did not."
        : delta > 0
          ? `Rigour raised by ${delta.toFixed(2)} for extension work, within the ${RIGOR_TOLERANCE} tolerance.`
          : `Rigour dropped by ${Math.abs(delta).toFixed(2)}. Variants may not lower the bar.`,
  };
}

export function buildStudentOverlays(
  room: Room,
  accessibility: AccessibilityPlan,
): StudentOverlay[] {
  return room.members.map((studentId) => {
    const layer = accessibility.layers.find((l) => l.student_id === studentId);
    const byChannel = (channel: string) =>
      (layer?.directives ?? [])
        .filter((d) => d.channel === channel)
        .map((d) => d.directive);

    return {
      student_id: studentId,
      room_id: room.room_id,
      presentation_notes: byChannel("presentation"),
      pacing_notes: byChannel("pacing"),
      visibility_notes: byChannel("visibility"),
      sequencing_notes: byChannel("sequencing"),
      changes_item_content: false,
    };
  });
}

export function buildVariant(
  assignment: Assignment,
  room: Room,
  accessibility: AccessibilityPlan,
  runId: string,
): AssignmentVariant {
  const items = buildVariantItems(assignment, room);

  return {
    variant_id: `var_${runId}_${room.room_id}`,
    room_id: room.room_id,
    room_name: roomNameById[room.room_id],
    based_on_assignment_id: assignment.assignment_id,
    title: `${assignment.title} — ${roomNameById[room.room_id]} pathway`,
    focus_concepts: room.focus_concepts,
    items,
    objective_preservation: checkObjectivePreservation(assignment, items),
    rigor_check: checkRigor(assignment, items),
    student_overlays: buildStudentOverlays(room, accessibility),
    rationale: `${roomNameById[room.room_id]} keeps all ${assignment.questions.length} items and all ${assignment.objectives.length} objectives from the original assignment. What changes is the route through them: ${room.base_adaptation}`,
    evidence_refs: room.evidence_refs,
  };
}

export function buildVariantBundle(
  assignment: Assignment,
  grouping: GroupingPlan,
  accessibility: AccessibilityPlan,
  runId: string,
): VariantBundle {
  const variants = grouping.rooms.map((room) =>
    buildVariant(assignment, room, accessibility, runId),
  );

  return {
    variants,
    all_objectives_preserved: variants.every(
      (v) => v.objective_preservation.preserved,
    ),
    all_rigor_checks_passed: variants.every((v) => v.rigor_check.within_tolerance),
  };
}

function pipelineSeed(bundle: VariantBundle): VariantGenerationOutput {
  return {
    variants: bundle.variants.map((variant) => ({
      room_id: variant.room_id,
      rationale: variant.rationale,
      items: variant.items.map((item) => ({
        source_question_id: item.source_question_id,
        prompt: item.prompt,
        scaffold: item.scaffold,
      })),
    })),
  };
}

/** Apply only delivery-language changes; objectives, concepts and difficulty stay authoritative. */
export function applyGeneratedVariants(
  assignment: Assignment,
  base: VariantBundle,
  generated: VariantGenerationOutput,
): VariantBundle {
  const generatedByRoom = new Map(
    generated.variants.map((variant) => [variant.room_id, variant]),
  );
  if (
    generatedByRoom.size !== base.variants.length ||
    generated.variants.length !== base.variants.length
  ) {
    throw new Error("RocketRide must return exactly one variant for every room.");
  }

  const variants = base.variants.map((variant) => {
    const proposal = generatedByRoom.get(variant.room_id);
    if (!proposal) {
      throw new Error(`RocketRide omitted the ${variant.room_id} room variant.`);
    }
    const generatedItems = new Map(
      proposal.items.map((item) => [item.source_question_id, item]),
    );
    const expectedIds = variant.items.map((item) => item.source_question_id);
    if (
      generatedItems.size !== expectedIds.length ||
      proposal.items.length !== expectedIds.length ||
      expectedIds.some((id) => !generatedItems.has(id))
    ) {
      throw new Error(
        `RocketRide changed question coverage for the ${variant.room_id} room.`,
      );
    }

    const items = variant.items.map((item) => {
      const generatedItem = generatedItems.get(item.source_question_id)!;
      return {
        ...item,
        prompt: generatedItem.prompt,
        scaffold: generatedItem.scaffold,
      };
    });

    return {
      ...variant,
      items,
      rationale: proposal.rationale,
      objective_preservation: checkObjectivePreservation(assignment, items),
      rigor_check: checkRigor(assignment, items),
    };
  });

  return {
    variants,
    all_objectives_preserved: variants.every(
      (variant) => variant.objective_preservation.preserved,
    ),
    all_rigor_checks_passed: variants.every(
      (variant) => variant.rigor_check.within_tolerance,
    ),
  };
}

function finishCuratorRun(
  ctx: AgentContext,
  bundle: VariantBundle,
  provenance?: MotionProvenance,
): AgentResult<VariantBundle> {
  const checksPassed =
    bundle.all_objectives_preserved && bundle.all_rigor_checks_passed;
  const generatedProposalNeedsReview =
    provenance !== undefined && !provenance.deterministic;
  const confidence = round4(
    checksPassed ? (generatedProposalNeedsReview ? 0.82 : 0.94) : 0.45,
  );

  const result = buildAgentResult(variantBundleSchema, {
    run_id: ctx.run_id,
    agent: AGENT,
    confidence,
    evidence_refs: [
      ...bundle.variants.flatMap((variant) => variant.evidence_refs),
      ...(provenance?.token ? [`rocketride:${provenance.token}`] : []),
    ],
    result: bundle,
    human_review_required: !checksPassed || generatedProposalNeedsReview,
  });

  ctx.emit("assignment.variants.ready", AGENT, {
    variant_count: bundle.variants.length,
    all_objectives_preserved: bundle.all_objectives_preserved,
    all_rigor_checks_passed: bundle.all_rigor_checks_passed,
    variants: bundle.variants.map((v) => ({
      ...v,
      item_count: v.items.length,
      objectives_preserved: v.objective_preservation.preserved,
      rigor_delta: v.rigor_check.delta,
      overlay_count: v.student_overlays.length,
      objective_preserved: v.objective_preservation.preserved,
      objective_statement: v.objective_preservation.checks[0]?.statement ?? "Objectives preserved.",
      adaptation_summary: v.rationale,
      problems: v.items.map((item) => ({
        problem_id: item.item_id,
        prompt: item.prompt,
        concepts: item.concepts,
      })),
      student_layers: v.student_overlays.map((overlay) => ({
        student_id: overlay.student_id,
        supports_applied: [],
        delivery_notes: [
          ...overlay.presentation_notes,
          ...overlay.pacing_notes,
          ...overlay.visibility_notes,
          ...overlay.sequencing_notes,
        ].join(" "),
        problems: [],
      })),
    })),
    confidence: result.confidence,
    ...(provenance ? { pipeline: provenance } : {}),
  });

  return result;
}

export function runAssignmentCurator(
  ctx: AgentContext,
  assignment: Assignment,
  grouping: GroupingPlan,
  accessibility: AccessibilityPlan,
): AgentResult<VariantBundle> {
  const bundle = buildVariantBundle(assignment, grouping, accessibility, ctx.run_id);
  return finishCuratorRun(ctx, bundle);
}

export async function runAssignmentCuratorWithPipeline(
  ctx: AgentContext,
  assignment: Assignment,
  grouping: GroupingPlan,
  accessibility: AccessibilityPlan,
  rocketride: RocketRidePipelineAdapter,
): Promise<AgentResult<VariantBundle>> {
  const base = buildVariantBundle(
    assignment,
    grouping,
    accessibility,
    ctx.run_id,
  );
  const generated = await generateRoomVariants(rocketride, {
    assignment,
    rooms: grouping.rooms.map((room) => ({
      room_id: room.room_id,
      dominant_barrier: room.dominant_barrier,
      base_adaptation: room.base_adaptation,
      focus_concepts: room.focus_concepts,
    })),
    mockOutput: pipelineSeed(base),
  });
  const bundle = applyGeneratedVariants(
    assignment,
    base,
    generated.output,
  );
  return finishCuratorRun(ctx, bundle, generated.provenance);
}
