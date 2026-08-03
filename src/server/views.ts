import type {
  AccessibilityLayer,
  AssignmentVariant,
  ConceptSummary,
  Room,
  RoomId,
  RunState,
  Student,
  StudentContext,
  StudentOverlay,
} from "@/contracts";

/**
 * Read models for the detail routes. Person A renders these directly, so the
 * shapes are part of the branch's public surface.
 */

export type StudentCard = {
  run_id: string | null;
  student: Student;
  context: StudentContext | null;
  room: {
    room_id: RoomId;
    name: string;
    dominant_barrier: string;
    base_adaptation: string;
    explanation: string;
  } | null;
  placement: {
    room_fit: number;
    rationale: string;
    evidence_refs: string[];
  } | null;
  accessibility: AccessibilityLayer | null;
  overlay: StudentOverlay | null;
  variant_id: string | null;
};

export function buildStudentCard(
  student: Student,
  run: RunState | null,
): StudentCard {
  if (!run) {
    return {
      run_id: null,
      student,
      context: null,
      room: null,
      placement: null,
      accessibility: null,
      overlay: null,
      variant_id: null,
    };
  }

  const context =
    run.student_contexts.find((c) => c.student_id === student.student_id) ??
    null;
  const placement =
    run.grouping?.placements.find((p) => p.student_id === student.student_id) ??
    null;
  const room = placement
    ? (run.rooms.find((r) => r.room_id === placement.room_id) ?? null)
    : null;
  const accessibility =
    run.accessibility?.layers.find(
      (l) => l.student_id === student.student_id,
    ) ?? null;
  const variant = room
    ? (run.variants.find((v) => v.room_id === room.room_id) ?? null)
    : null;
  const overlay =
    variant?.student_overlays.find(
      (o) => o.student_id === student.student_id,
    ) ?? null;

  return {
    run_id: run.run_id,
    student,
    context,
    room: room
      ? {
          room_id: room.room_id,
          name: room.name,
          dominant_barrier: room.dominant_barrier,
          base_adaptation: room.base_adaptation,
          explanation: room.explanation,
        }
      : null,
    placement: placement
      ? {
          room_fit: placement.room_fit,
          rationale: placement.rationale,
          evidence_refs: placement.evidence_refs,
        }
      : null,
    accessibility,
    overlay,
    variant_id: variant?.variant_id ?? null,
  };
}

export type RoomDetail = {
  run_id: string;
  room: Room;
  focus_concepts: ConceptSummary[];
  members: Array<{
    student_id: string;
    display_name: string;
    mean_mastery: number;
    weighted_gap: number;
    active_misconceptions: string[];
    room_fit: number;
    rationale: string;
  }>;
  variant: AssignmentVariant | null;
  delivery_note: string | null;
};

export function buildRoomDetail(room: Room, run: RunState): RoomDetail {
  const contextById = new Map(
    run.student_contexts.map((c) => [c.student_id, c]),
  );
  const placementById = new Map(
    (run.grouping?.placements ?? []).map((p) => [p.student_id, p]),
  );

  return {
    run_id: run.run_id,
    room,
    focus_concepts: run.concepts.filter((c) =>
      room.focus_concepts.includes(c.concept_id),
    ),
    members: room.members.map((studentId) => {
      const context = contextById.get(studentId);
      const placement = placementById.get(studentId);
      return {
        student_id: studentId,
        display_name: context?.display_name ?? studentId,
        mean_mastery: context?.mean_mastery ?? 0,
        weighted_gap: context?.weighted_gap ?? 0,
        active_misconceptions: context?.active_misconceptions ?? [],
        room_fit: placement?.room_fit ?? 0,
        rationale: placement?.rationale ?? "",
      };
    }),
    variant: run.variants.find((v) => v.room_id === room.room_id) ?? null,
    delivery_note:
      run.accessibility?.room_delivery_notes.find(
        (n) => n.room_id === room.room_id,
      )?.note ?? null,
  };
}
