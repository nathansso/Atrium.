import type { AgentEvent, EventType } from "@/contracts";
import {
  MOCK_RUN_ID,
  mockAssessments,
  mockAssignment,
  mockConcepts,
  mockLessonPlan,
  mockMoves,
  mockReviewQueue,
  mockRooms,
  mockStudents,
  mockUpdatedStudents,
  mockVariants,
} from "./seed";

export type MockEvent = AgentEvent & {
  /** Milliseconds to wait after the previous event before emitting this one. */
  delay_ms: number;
};

/**
 * The frozen demo sequence. Phase one runs on "Start run"; phase two runs on
 * "Run classroom simulation", mirroring `POST /api/runs` and
 * `POST /api/runs/:runId/simulate-submissions`.
 */
const PHASE_ONE_TYPES: EventType[] = [
  "assignment.uploaded",
  "assignment.concepts.extracted",
  "student.context.ready",
  "groups.proposed",
  "accessibility.layers.ready",
  "assignment.variants.ready",
];

export function isPhaseOne(eventType: EventType): boolean {
  return PHASE_ONE_TYPES.includes(eventType);
}

function baseTimestamp(index: number): string {
  // Fixed clock so replays are byte-identical between runs.
  return new Date(Date.UTC(2026, 4, 13, 14, 0, index * 7)).toISOString();
}

export function buildMockEvents(runId: string = MOCK_RUN_ID): MockEvent[] {
  const definitions: Array<Omit<MockEvent, "event_id" | "run_id" | "timestamp">> = [
    {
      event_type: "assignment.uploaded",
      source_agent: "assignment_architect",
      delay_ms: 400,
      payload: {
        assignment: mockAssignment,
        teaching_intent: mockAssignment.teaching_intent,
      },
    },
    {
      event_type: "assignment.concepts.extracted",
      source_agent: "assignment_architect",
      delay_ms: 2200,
      payload: {
        concepts: mockConcepts,
        objective: "Solve multi-step linear equations and justify each step.",
      },
    },
    {
      event_type: "student.context.ready",
      source_agent: "student_memory_agent",
      delay_ms: 2400,
      payload: {
        students: mockStudents,
        lookback_days: 30,
        evidence_refs: ["ev:memory:window:30d"],
      },
    },
    {
      event_type: "groups.proposed",
      source_agent: "grouping_agent",
      delay_ms: 2600,
      payload: {
        rooms: mockRooms,
        grouping_basis: "current_learning_barrier",
        note: "Rooms are temporary and barrier-based. No diagnosis or accommodation label is used as a grouping input.",
      },
    },
    {
      event_type: "accessibility.layers.ready",
      source_agent: "accessibility_agent",
      delay_ms: 2200,
      payload: {
        layers: mockStudents
          .filter((student) => student.supports.length > 0)
          .map((student) => ({
            student_id: student.student_id,
            supports: student.supports,
            note: "Delivery layer only. Academic content is unchanged.",
          })),
      },
    },
    {
      event_type: "assignment.variants.ready",
      source_agent: "assignment_curator",
      delay_ms: 2600,
      payload: {
        variants: mockVariants,
        objective_preserved: true,
      },
    },
    {
      event_type: "submissions.received",
      source_agent: "assessment_agent",
      delay_ms: 600,
      payload: {
        submissions: mockAssessments.map((assessment) => ({
          student_id: assessment.student_id,
          room_id: assessment.room_id,
          submitted_at: "2026-05-13T15:10:00.000Z",
        })),
      },
    },
    {
      event_type: "assessment.completed",
      source_agent: "assessment_agent",
      delay_ms: 3200,
      payload: {
        assessments: mockAssessments,
        low_confidence_count: mockAssessments.filter((a) => a.human_review_required).length,
      },
    },
    {
      event_type: "student.models.updated",
      source_agent: "classroom_evolution_agent",
      delay_ms: 2800,
      payload: {
        students: mockUpdatedStudents,
        moves: mockMoves,
        method: "bkt_update_with_misconception_penalty",
      },
    },
    {
      event_type: "lesson.plan.ready",
      source_agent: "lesson_planner",
      delay_ms: 2800,
      payload: { lesson_plan: mockLessonPlan },
    },
    {
      event_type: "approval.requested",
      source_agent: "assessment_agent",
      delay_ms: 1600,
      payload: { review_queue: mockReviewQueue },
    },
  ];

  return definitions.map((definition, index) => ({
    event_id: `evt_${String(index + 1).padStart(2, "0")}`,
    run_id: runId,
    timestamp: baseTimestamp(index),
    ...definition,
  }));
}

export function mockPhaseOneEvents(runId: string = MOCK_RUN_ID): MockEvent[] {
  return buildMockEvents(runId).filter((event) => isPhaseOne(event.event_type));
}

export function mockPhaseTwoEvents(runId: string = MOCK_RUN_ID): MockEvent[] {
  return buildMockEvents(runId).filter((event) => !isPhaseOne(event.event_type));
}
