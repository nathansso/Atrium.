import {
  conceptLabels,
  groupingPlanSchema,
  misconceptionLabels,
  roomNameById,
  supportIds,
  type AgentResult,
  type AssignmentAnalysis,
  type ConceptId,
  type GroupingPlan,
  type MisconceptionId,
  type Room,
  type RoomFitBreakdown,
  type RoomId,
  type RoomName,
  type StudentContext,
  type SupportId,
} from "@/contracts";
import { buildAgentResult, type AgentContext } from "../agentRuntime";
import { clamp, round4 } from "../deterministic";
import type { SharedBarrierGroup } from "../adapters";

/**
 * Grouping Agent.
 *
 * Consumes: `student.context.ready`
 * Publishes: `groups.proposed`
 *
 * Rooms are temporary and describe the academic barrier a student is facing
 * right now. Diagnoses, accommodation labels, and documented supports are never
 * inputs to placement — see `EXCLUDED_SIGNALS` and the `support_compatibility`
 * note below.
 *
 *   room_fit = 0.45 * concept_gap_similarity
 *            + 0.30 * misconception_similarity
 *            + 0.15 * mastery_band_similarity
 *            + 0.10 * support_compatibility
 *            - fragmentation_penalty
 */
export const AGENT = "grouping_agent" as const;

export const WEIGHTS = {
  concept_gap: 0.45,
  misconception: 0.3,
  mastery_band: 0.15,
  support_compatibility: 0.1,
} as const;

/** Minimum viable room size, per the Person B spec. */
export const MIN_ROOM_SIZE = 2;

/** Penalty per student above the soft capacity of a room. */
export const FRAGMENTATION_RATE = 0.05;

/** A student at or above this mean mastery with no active barrier extends. */
export const EXTENSION_MASTERY_THRESHOLD = 0.85;

export const GROUPING_SIGNALS_USED = [
  "concept_gap_vs_assignment_weights",
  "recent_misconception_evidence",
  "mastery_band",
  "room_capacity_balance",
];

export const EXCLUDED_SIGNALS = [
  "diagnosis",
  "disability_category",
  "accommodation_label",
  "documented_support",
  "iep_or_504_status",
  "service_minutes",
  "english_proficiency_label",
  "behavior_record",
];

type RoomProfile = {
  room_id: RoomId;
  name: RoomName;
  dominant_barrier: string;
  focus_concepts: ConceptId[];
  signature_misconceptions: MisconceptionId[];
  /** Target shape of the unmet-need vector for this room. */
  gap_profile: Record<ConceptId, number>;
  /** Centre of the mastery band this room is built for. */
  band_center: number;
  base_adaptation: string;
};

export const ROOM_PROFILES: RoomProfile[] = [
  {
    room_id: "ember",
    name: "Ember",
    dominant_barrier: "Repeated sign errors in integer operations",
    focus_concepts: ["integer_operations", "combining_like_terms"],
    signature_misconceptions: [
      "sign_error_on_subtraction",
      "drops_negative_coefficient",
    ],
    gap_profile: {
      integer_operations: 1,
      distributive_property: 0.25,
      equation_sequencing: 0.25,
      combining_like_terms: 0.35,
    },
    band_center: 0.55,
    base_adaptation:
      "Signed-number reasoning made visible: number line and two-colour chip framing before any symbolic step.",
  },
  {
    room_id: "forge",
    name: "Forge",
    dominant_barrier: "Distribution applied to only part of the expression",
    focus_concepts: ["distributive_property", "combining_like_terms"],
    signature_misconceptions: [
      "partial_distribution",
      "distributes_only_first_term",
    ],
    gap_profile: {
      integer_operations: 0.25,
      distributive_property: 1,
      equation_sequencing: 0.3,
      combining_like_terms: 0.4,
    },
    band_center: 0.58,
    base_adaptation:
      "Area-model distribution with one term per line, so every term inside the group visibly receives the factor.",
  },
  {
    room_id: "harbor",
    name: "Harbor",
    dominant_barrier: "Correct operations applied in the wrong order",
    focus_concepts: ["equation_sequencing", "combining_like_terms"],
    signature_misconceptions: [
      "operation_order_inversion",
      "inverse_operation_misapplied",
    ],
    gap_profile: {
      integer_operations: 0.3,
      distributive_property: 0.3,
      equation_sequencing: 1,
      combining_like_terms: 0.35,
    },
    band_center: 0.57,
    base_adaptation:
      "Plan-then-solve step ledger: students commit to an undo order in writing before touching the equation.",
  },
  {
    room_id: "summit",
    name: "Summit",
    dominant_barrier:
      "Secure across all four concepts; needs extension rather than repair",
    focus_concepts: [
      "integer_operations",
      "distributive_property",
      "equation_sequencing",
      "combining_like_terms",
    ],
    signature_misconceptions: [],
    gap_profile: {
      integer_operations: 0.08,
      distributive_property: 0.08,
      equation_sequencing: 0.08,
      combining_like_terms: 0.08,
    },
    band_center: 0.93,
    base_adaptation:
      "Extension work: justify each step, move between representations, and diagnose errors in someone else's solution.",
  },
];

/** Curriculum runs have a run-scoped concept registry rather than Algebra's fixed barriers. */
function profilesFor(concepts: ConceptId[]): RoomProfile[] {
  const isSeededAlgebra = concepts.every((concept) => Object.hasOwn(conceptLabels, concept));
  if (isSeededAlgebra) return ROOM_PROFILES;
  const definitions: Array<Pick<RoomProfile, "room_id" | "name" | "band_center">> = [
    { room_id: "ember", name: "Ember", band_center: 0.45 },
    { room_id: "forge", name: "Forge", band_center: 0.55 },
    { room_id: "harbor", name: "Harbor", band_center: 0.65 },
    { room_id: "summit", name: "Summit", band_center: 0.9 },
  ];
  return definitions.map((definition, index) => {
    const focus = concepts[index % concepts.length] ?? concepts[0]!;
    return {
      ...definition,
      dominant_barrier: definition.room_id === "summit"
        ? "Secure understanding ready for extension"
        : `Developing understanding of ${conceptLabels[focus] ?? focus}`,
      focus_concepts: definition.room_id === "summit" ? concepts : [focus],
      signature_misconceptions: [],
      gap_profile: Object.fromEntries(concepts.map((concept) => [concept, concept === focus ? 1 : 0.35])),
      base_adaptation: definition.room_id === "summit"
        ? "Extension: justify choices, compare examples, and apply the concept to a new context."
        : `Make ${conceptLabels[focus] ?? focus} visible with worked examples, vocabulary support, and a short check for understanding.`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Similarity components                                                       */
/* -------------------------------------------------------------------------- */

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return clamp(dot / (magA * magB));
}

/**
 * Cosine similarity between the student's unmet-need vector and the room's
 * target profile, both scaled by how much this assignment weights each concept.
 */
export function conceptGapSimilarity(
  context: StudentContext,
  profile: RoomProfile,
  weightByConcept: Map<ConceptId, number>,
): number {
  const concepts = context.concept_context.map((c) => c.concept_id);
  const studentVector = context.concept_context.map(
    (c) => c.gap * (weightByConcept.get(c.concept_id) ?? 0),
  );
  const roomVector = concepts.map(
    (concept) => (profile.gap_profile[concept] ?? 0) * (weightByConcept.get(concept) ?? 0),
  );
  return round4(cosine(studentVector, roomVector));
}

/** Jaccard overlap between observed barriers and the room's signature ones. */
export function misconceptionSimilarity(
  context: StudentContext,
  profile: RoomProfile,
): number {
  const student = new Set<MisconceptionId>(context.active_misconceptions);
  const room = new Set<MisconceptionId>(profile.signature_misconceptions);
  if (student.size === 0 && room.size === 0) return 1;
  if (student.size === 0 || room.size === 0) return 0;
  const intersection = [...student].filter((m) => room.has(m)).length;
  const union = new Set([...student, ...room]).size;
  return round4(intersection / union);
}

export function masteryBandSimilarity(
  context: StudentContext,
  profile: RoomProfile,
): number {
  return round4(clamp(1 - Math.abs(context.mean_mastery - profile.band_center)));
}

/**
 * Every room delivers every documented support, because accessibility is an
 * overlay on top of a room rather than a property of the room. This term is
 * therefore constant across rooms by construction: it satisfies the contract
 * formula while remaining mathematically incapable of moving a student toward
 * one room over another. `tests/grouping.test.ts` asserts that invariant.
 */
const DELIVERABLE_SUPPORTS = new Set<SupportId>(supportIds);

export function supportCompatibility(
  _roomId: RoomId,
  supports: SupportId[],
): number {
  if (supports.length === 0) return 1;
  const deliverable = supports.filter((s) => DELIVERABLE_SUPPORTS.has(s)).length;
  return round4(deliverable / supports.length);
}

export function fragmentationPenalty(
  prospectiveSize: number,
  softCap: number,
): number {
  return round4(FRAGMENTATION_RATE * Math.max(0, prospectiveSize - softCap));
}

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

type ScoredRoom = {
  profile: RoomProfile;
  breakdown: RoomFitBreakdown;
};

function scoreRoom(
  context: StudentContext,
  profile: RoomProfile,
  weightByConcept: Map<ConceptId, number>,
  penalty: number,
): ScoredRoom {
  const conceptGap = conceptGapSimilarity(context, profile, weightByConcept);
  const misconception = misconceptionSimilarity(context, profile);
  const band = masteryBandSimilarity(context, profile);
  const support = supportCompatibility(
    profile.room_id,
    context.documented_supports,
  );

  const fit = round4(
    WEIGHTS.concept_gap * conceptGap +
      WEIGHTS.misconception * misconception +
      WEIGHTS.mastery_band * band +
      WEIGHTS.support_compatibility * support -
      penalty,
  );

  return {
    profile,
    breakdown: {
      student_id: context.student_id,
      room_id: profile.room_id,
      concept_gap_similarity: conceptGap,
      misconception_similarity: misconception,
      mastery_band_similarity: band,
      support_compatibility: support,
      fragmentation_penalty: penalty,
      room_fit: fit,
    },
  };
}

function placementRationale(
  context: StudentContext,
  profile: RoomProfile,
  graphPath?: string,
): string {
  const topGap = [...context.concept_context].sort(
    (a, b) => b.gap - a.gap || (a.concept_id < b.concept_id ? -1 : 1),
  )[0];

  const sharedBarriers = context.active_misconceptions.filter((m) =>
    profile.signature_misconceptions.includes(m),
  );

  if (profile.room_id === "summit") {
    return `${context.display_name} is at ${(context.mean_mastery * 100).toFixed(0)} percent mean mastery across the assignment concepts with no active barrier in recent work, so Summit extends rather than repairs.`;
  }

  const barrierText =
    sharedBarriers.length > 0
      ? ` Recent work shows ${sharedBarriers
          .map((m) => misconceptionLabels[m].toLowerCase())
          .join(" and ")}.`
      : " No signature barrier yet, so placement follows the largest concept gap.";

  const graphSentence = graphPath
    ? ` FalkorDB confirmed the shared barrier through ${graphPath}.`
    : "";

  return `${context.display_name} has the largest unmet need in ${conceptLabels[topGap.concept_id]} (mastery ${topGap.mastery.score.toFixed(2)}).${barrierText}${graphSentence}`;
}

function roomExplanation(
  profile: RoomProfile,
  members: StudentContext[],
  graphPaths: string[] = [],
): string {
  const barrierCounts = new Map<MisconceptionId, number>();
  for (const member of members) {
    for (const misconception of member.active_misconceptions) {
      if (profile.signature_misconceptions.includes(misconception)) {
        barrierCounts.set(
          misconception,
          (barrierCounts.get(misconception) ?? 0) + 1,
        );
      }
    }
  }

  const evidenceSentence =
    barrierCounts.size > 0
      ? [...barrierCounts.entries()]
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
          .map(
            ([misconception, count]) =>
              `${misconceptionLabels[misconception].toLowerCase()} in ${count} of ${members.length} students`,
          )
          .join("; ")
      : `mean mastery ${(
          members.reduce((sum, m) => sum + m.mean_mastery, 0) / members.length
        ).toFixed(2)} with no active barrier on these concepts`;

  const graphSentence =
    graphPaths.length > 0
      ? ` FalkorDB traversal: ${graphPaths.join("; ")}.`
      : "";

  return `${profile.name} exists because of one shared academic barrier: ${profile.dominant_barrier.toLowerCase()}. Evidence: ${evidenceSentence}.${graphSentence} Placement used current work only; no diagnosis or accommodation label was read.`;
}

type GraphPlacement = {
  profile: RoomProfile;
  group: SharedBarrierGroup;
  evidenceRef: string;
};

function graphPlacements(
  contexts: StudentContext[],
  sharedBarriers: SharedBarrierGroup[],
  profiles: RoomProfile[],
): Map<string, GraphPlacement> {
  const knownStudents = new Set(contexts.map((context) => context.student_id));
  const candidates = sharedBarriers
    .map((group) => ({
      group,
      profile: profiles.find((profile) =>
        profile.signature_misconceptions.includes(group.misconception_id),
      ),
    }))
    .filter(
      (candidate): candidate is {
        group: SharedBarrierGroup;
        profile: RoomProfile;
      } =>
        candidate.profile !== undefined &&
        candidate.group.student_ids.filter((studentId) =>
          knownStudents.has(studentId),
        ).length >= MIN_ROOM_SIZE,
    )
    .sort(
      (a, b) =>
        b.group.student_ids.length - a.group.student_ids.length ||
        a.group.misconception_id.localeCompare(b.group.misconception_id) ||
        a.profile.room_id.localeCompare(b.profile.room_id),
    );

  const placements = new Map<string, GraphPlacement>();
  for (const { group, profile } of candidates) {
    const evidenceRef = `falkordb:shared-barrier:${group.misconception_id}:${group.concept_id}`;
    for (const studentId of [...group.student_ids].sort()) {
      if (!knownStudents.has(studentId) || placements.has(studentId)) continue;
      placements.set(studentId, { profile, group, evidenceRef });
    }
  }
  return placements;
}

export function buildGroupingPlan(
  contexts: StudentContext[],
  analysis: AssignmentAnalysis,
  sharedBarriers: SharedBarrierGroup[] = [],
): GroupingPlan {
  const weightByConcept = new Map<ConceptId, number>(
    analysis.concepts.map((c) => [c.concept_id, c.weight]),
  );
  const profiles = profilesFor(analysis.concepts.map((concept) => concept.concept_id));
  const softCap = Math.ceil(contexts.length / profiles.length);

  const assignments = new Map<RoomId, StudentContext[]>(
    profiles.map((p) => [p.room_id, []]),
  );
  const fitMatrix: RoomFitBreakdown[] = [];
  const chosen = new Map<string, { room_id: RoomId; room_fit: number }>();
  const graphByStudent = graphPlacements(contexts, sharedBarriers, profiles);

  // Students whose current work shows no barrier and whose mastery is already
  // above the extension threshold are placed first; this keeps the greedy pass
  // from spending Summit capacity on students who still need repair.
  const extensionReady = contexts.filter(
    (c) =>
      !graphByStudent.has(c.student_id) &&
      c.mean_mastery >= EXTENSION_MASTERY_THRESHOLD &&
      c.active_misconceptions.length === 0,
  );
  const graphReady = contexts.filter((c) => graphByStudent.has(c.student_id));
  const remaining = contexts.filter(
    (c) => !extensionReady.includes(c) && !graphByStudent.has(c.student_id),
  );

  const scoreAll = (context: StudentContext) =>
    profiles.map((profile) =>
      scoreRoom(
        context,
        profile,
        weightByConcept,
        fragmentationPenalty(
          (assignments.get(profile.room_id)?.length ?? 0) + 1,
          softCap,
        ),
      ),
    );

  const commit = (
    context: StudentContext,
    scored: ScoredRoom[],
    forcedProfile?: RoomProfile,
  ) => {
    const ranked = [...scored].sort(
      (a, b) =>
        b.breakdown.room_fit - a.breakdown.room_fit ||
        (a.profile.room_id < b.profile.room_id ? -1 : 1),
    );
    const best = forcedProfile
      ? ranked.find((entry) => entry.profile.room_id === forcedProfile.room_id)!
      : ranked[0];
    assignments.get(best.profile.room_id)!.push(context);
    chosen.set(context.student_id, {
      room_id: best.profile.room_id,
      room_fit: best.breakdown.room_fit,
    });
    fitMatrix.push(...scored.map((s) => s.breakdown));
  };

  // Graph-confirmed cohorts go first so the shared path is load-bearing in
  // room formation, rather than being attached later as decorative metadata.
  for (const context of [...graphReady].sort((a, b) =>
    a.student_id < b.student_id ? -1 : 1,
  )) {
    commit(context, scoreAll(context), graphByStudent.get(context.student_id)!.profile);
  }

  for (const context of [...extensionReady].sort((a, b) =>
    a.student_id < b.student_id ? -1 : 1,
  )) {
    commit(context, scoreAll(context));
  }

  // Most decisive students first: a large gap between best and second-best room
  // means the placement is well evidenced, so it should not be displaced by
  // capacity pressure created later.
  const ordered = [...remaining]
    .map((context) => {
      const scored = scoreAll(context);
      const sorted = [...scored].sort(
        (a, b) => b.breakdown.room_fit - a.breakdown.room_fit,
      );
      return {
        context,
        margin: round4(
          sorted[0].breakdown.room_fit - (sorted[1]?.breakdown.room_fit ?? 0),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.margin - a.margin ||
        (a.context.student_id < b.context.student_id ? -1 : 1),
    );

  for (const { context } of ordered) {
    commit(context, scoreAll(context));
  }

  // Repair pass: dissolve any room that cannot reach the minimum size and move
  // its members to their next-best room.
  for (const profile of profiles) {
    const members = assignments.get(profile.room_id)!;
    if (members.length === 0 || members.length >= MIN_ROOM_SIZE) continue;

    for (const member of [...members]) {
      const alternatives = profiles.filter(
        (p) =>
          p.room_id !== profile.room_id &&
          assignments.get(p.room_id)!.length >= MIN_ROOM_SIZE,
      );
      const target = alternatives
        .map((p) =>
          scoreRoom(
            member,
            p,
            weightByConcept,
            fragmentationPenalty(assignments.get(p.room_id)!.length + 1, softCap),
          ),
        )
        .sort(
          (a, b) =>
            b.breakdown.room_fit - a.breakdown.room_fit ||
            (a.profile.room_id < b.profile.room_id ? -1 : 1),
        )[0];
      if (!target) continue;

      assignments.set(
        profile.room_id,
        assignments.get(profile.room_id)!.filter(
          (m) => m.student_id !== member.student_id,
        ),
      );
      assignments.get(target.profile.room_id)!.push(member);
      chosen.set(member.student_id, {
        room_id: target.profile.room_id,
        room_fit: target.breakdown.room_fit,
      });
      fitMatrix.push(target.breakdown);
    }
  }

  const rooms: Room[] = profiles.filter(
    (profile) => assignments.get(profile.room_id)!.length > 0,
  ).map((profile) => {
    const members = [...assignments.get(profile.room_id)!].sort((a, b) =>
      a.student_id < b.student_id ? -1 : 1,
    );
    const graphEvidence = members
      .map((member) => graphByStudent.get(member.student_id))
      .filter(
        (placement): placement is GraphPlacement =>
          placement?.profile.room_id === profile.room_id,
      );
    const graphRefs = [...new Set(graphEvidence.map((item) => item.evidenceRef))];
    const graphPaths = [
      ...new Set(graphEvidence.map((item) => item.group.path_explanation)),
    ];
    return {
      room_id: profile.room_id,
      name: roomNameById[profile.room_id],
      focus_concepts: profile.focus_concepts,
      dominant_barrier: profile.dominant_barrier,
      evidence_refs: [
        ...members.flatMap((m) =>
          m.evidence_refs.filter(
            (ref) => ref.includes("#pattern:") || ref.includes("#mastery:"),
          ),
        ),
        ...graphRefs,
      ],
      members: members.map((m) => m.student_id),
      base_adaptation: profile.base_adaptation,
      explanation: roomExplanation(profile, members, graphPaths),
    };
  });

  const profileById = new Map(profiles.map((p) => [p.room_id, p]));

  const placements = [...contexts]
    .sort((a, b) => (a.student_id < b.student_id ? -1 : 1))
    .map((context) => {
      const decision = chosen.get(context.student_id)!;
      const profile = profileById.get(decision.room_id)!;
      const graphPlacement = graphByStudent.get(context.student_id);
      return {
        student_id: context.student_id,
        room_id: decision.room_id,
        room_fit: decision.room_fit,
        rationale: placementRationale(
          context,
          profile,
          graphPlacement?.profile.room_id === decision.room_id
            ? graphPlacement.group.path_explanation
            : undefined,
        ),
        evidence_refs: [
          ...context.evidence_refs,
          ...(graphPlacement?.profile.room_id === decision.room_id
            ? [graphPlacement.evidenceRef]
            : []),
        ],
      };
    });

  return {
    rooms,
    placements,
    fit_matrix: fitMatrix,
    grouping_signals_used:
      graphByStudent.size > 0
        ? [...GROUPING_SIGNALS_USED, "falkordb_shared_barrier_path"]
        : GROUPING_SIGNALS_USED,
    excluded_signals: EXCLUDED_SIGNALS,
  };
}

export function runGrouping(
  ctx: AgentContext,
  contexts: StudentContext[],
  analysis: AssignmentAnalysis,
  sharedBarriers: SharedBarrierGroup[] = [],
): AgentResult<GroupingPlan> {
  const plan = buildGroupingPlan(contexts, analysis, sharedBarriers);

  // Confidence is the mean decisiveness of the placements: how far the chosen
  // room scored above the average alternative for that student.
  const byStudent = new Map<string, RoomFitBreakdown[]>();
  for (const row of plan.fit_matrix) {
    byStudent.set(row.student_id, [...(byStudent.get(row.student_id) ?? []), row]);
  }
  const margins = plan.placements.map((placement) => {
    const rows = byStudent.get(placement.student_id) ?? [];
    const others = rows.filter((r) => r.room_id !== placement.room_id);
    if (others.length === 0) return 0;
    const meanOther =
      others.reduce((sum, r) => sum + r.room_fit, 0) / others.length;
    return clamp(placement.room_fit - meanOther);
  });
  const meanMargin =
    margins.reduce((sum, v) => sum + v, 0) / Math.max(1, margins.length);
  const confidence = round4(clamp(0.5 + meanMargin));

  const result = buildAgentResult(groupingPlanSchema, {
    run_id: ctx.run_id,
    agent: AGENT,
    confidence,
    evidence_refs: plan.rooms.flatMap((room) => room.evidence_refs),
    result: plan,
    human_review_required: confidence < 0.6,
  });

  ctx.emit("groups.proposed", AGENT, {
    room_count: plan.rooms.length,
    rooms: plan.rooms.map((room) => ({
      room_id: room.room_id,
      name: room.name,
      dominant_barrier: room.dominant_barrier,
      focus_concepts: room.focus_concepts,
      member_count: room.members.length,
      members: room.members,
      explanation: room.explanation,
    })),
    grouping_signals_used: plan.grouping_signals_used,
    excluded_signals: plan.excluded_signals,
    confidence: result.confidence,
  });

  return result;
}
