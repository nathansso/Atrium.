import type {
  AgentEvent,
  AssessmentResult,
  Assignment,
  AssignmentVariant,
  ConceptSummary,
  LessonPlan,
  ReviewItem,
  Room,
  RoomId,
  RunStatus,
  Student,
  SupportId,
} from "@/contracts";
import {
  readAssessments,
  readAssignment,
  readConceptSummaries,
  readLessonPlan,
  readMoves,
  readReviewItems,
  readRooms,
  readStudents,
  readSupportLayers,
  readVariants,
} from "./payloads";

/**
 * The React panels' view of a run, projected from the same `AgentEvent` stream
 * the world consumes. Mock replay and live SSE therefore produce identical UI
 * state — only the transport differs.
 */
export type RunProjection = {
  runId: string | null;
  status: RunStatus;
  assignment: Assignment | null;
  concepts: ConceptSummary[];
  students: Student[];
  rooms: Room[];
  variants: AssignmentVariant[];
  assessments: AssessmentResult[];
  lessonPlan: LessonPlan | null;
  reviewQueue: ReviewItem[];
  events: AgentEvent[];
  /** Live room membership, updated by both grouping and regrouping events. */
  studentRoom: Record<string, RoomId>;
  /** Room membership before the last regrouping, for before/after counts. */
  previousStudentRoom: Record<string, RoomId>;
  supports: Record<string, SupportId[]>;
};

export function createRunProjection(): RunProjection {
  return {
    runId: null,
    status: "created",
    assignment: null,
    concepts: [],
    students: [],
    rooms: [],
    variants: [],
    assessments: [],
    lessonPlan: null,
    reviewQueue: [],
    events: [],
    studentRoom: {},
    previousStudentRoom: {},
    supports: {},
  };
}

const STATUS_BY_EVENT: Partial<Record<string, RunStatus>> = {
  "assignment.uploaded": "created",
  "assignment.concepts.extracted": "analyzing",
  "student.context.ready": "analyzing",
  "groups.proposed": "grouped",
  "accessibility.layers.ready": "grouped",
  "assignment.variants.ready": "variants_ready",
  "submissions.received": "variants_ready",
  "assessment.completed": "assessed",
  "student.models.updated": "assessed",
  "lesson.plan.ready": "planned",
};

/** Fold one event into the projection. Returns a new object for React. */
export function applyEventToProjection(
  projection: RunProjection,
  event: AgentEvent,
): RunProjection {
  const next: RunProjection = {
    ...projection,
    runId: event.run_id || projection.runId,
    events: [...projection.events, event],
    studentRoom: { ...projection.studentRoom },
    previousStudentRoom: { ...projection.previousStudentRoom },
    supports: { ...projection.supports },
  };
  const status = STATUS_BY_EVENT[event.event_type];
  if (status) next.status = status;
  const payload = event.payload ?? {};

  switch (event.event_type) {
    case "assignment.uploaded": {
      const assignment = readAssignment(payload);
      if (assignment) next.assignment = assignment;
      break;
    }
    case "assignment.concepts.extracted": {
      const concepts = readConceptSummaries(payload);
      if (concepts.length > 0) next.concepts = concepts;
      break;
    }
    case "student.context.ready": {
      const students = readStudents(payload);
      if (students.length > 0) {
        next.students = students;
        for (const student of students) {
          if (student.supports?.length) next.supports[student.student_id] = student.supports;
        }
      }
      break;
    }
    case "groups.proposed": {
      const rooms = readRooms(payload);
      if (rooms.length > 0) {
        next.rooms = rooms;
        for (const room of rooms) {
          for (const studentId of room.members ?? []) {
            next.studentRoom[studentId] = room.room_id;
          }
        }
        next.previousStudentRoom = { ...next.studentRoom };
      }
      break;
    }
    case "accessibility.layers.ready": {
      for (const layer of readSupportLayers(payload)) {
        if (layer.supports.length > 0) next.supports[layer.student_id] = layer.supports;
      }
      break;
    }
    case "assignment.variants.ready": {
      const variants = readVariants(payload);
      if (variants.length > 0) next.variants = variants;
      break;
    }
    case "assessment.completed": {
      const assessments = readAssessments(payload);
      if (assessments.length > 0) next.assessments = assessments;
      break;
    }
    case "student.models.updated": {
      const students = readStudents(payload);
      if (students.length > 0) next.students = students;
      next.previousStudentRoom = { ...projection.studentRoom };
      const rooms = readRooms(payload);
      if (rooms.length > 0) {
        next.rooms = rooms;
        next.studentRoom = {};
        for (const room of rooms) {
          for (const studentId of room.members ?? []) {
            next.studentRoom[studentId] = room.room_id;
          }
        }
      } else {
        for (const move of readMoves(payload)) {
          if (move.to_room) next.studentRoom[move.student_id] = move.to_room;
        }
        next.rooms = next.rooms.map((room) => ({
          ...room,
          members: Object.entries(next.studentRoom)
            .filter(([, roomId]) => roomId === room.room_id)
            .map(([studentId]) => studentId),
        }));
      }
      break;
    }
    case "lesson.plan.ready": {
      const plan = readLessonPlan(payload);
      if (plan) next.lessonPlan = plan;
      break;
    }
    case "approval.requested": {
      const items = readReviewItems(payload);
      if (items.length > 0) {
        const existing = new Set(next.reviewQueue.map((item) => item.review_id));
        next.reviewQueue = [
          ...next.reviewQueue,
          ...items.filter((item) => !existing.has(item.review_id)),
        ];
      }
      break;
    }
    default:
      break;
  }

  return next;
}

export function studentById(
  projection: RunProjection,
  studentId: string,
): Student | undefined {
  return projection.students.find((student) => student.student_id === studentId);
}

export function roomById(projection: RunProjection, roomId: RoomId): Room | undefined {
  return projection.rooms.find((room) => room.room_id === roomId);
}

export function variantForRoom(
  projection: RunProjection,
  roomId: RoomId,
): AssignmentVariant | undefined {
  return projection.variants.find((variant) => variant.room_id === roomId);
}

export function assessmentFor(
  projection: RunProjection,
  studentId: string,
): AssessmentResult | undefined {
  return projection.assessments.find((entry) => entry.student_id === studentId);
}

export function membersOfRoom(projection: RunProjection, roomId: RoomId): Student[] {
  return projection.students.filter(
    (student) => projection.studentRoom[student.student_id] === roomId,
  );
}

/** Before/after head counts, used by the room panel after regrouping. */
export function roomCounts(
  projection: RunProjection,
  roomId: RoomId,
): { before: number; after: number } {
  const count = (map: Record<string, RoomId>) =>
    Object.values(map).filter((value) => value === roomId).length;
  return {
    before: count(projection.previousStudentRoom),
    after: count(projection.studentRoom),
  };
}
