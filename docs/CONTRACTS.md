# Shared Contracts

These contracts are the team API. Treat them as frozen after scaffold unless all branch owners agree.

## Event Types

```ts
export const eventTypes = [
  "assignment.uploaded",
  "assignment.concepts.extracted",
  "student.context.ready",
  "groups.proposed",
  "accessibility.layers.ready",
  "assignment.variants.ready",
  "submissions.received",
  "assessment.completed",
  "student.models.updated",
  "lesson.plan.ready",
  "approval.requested",
] as const;
```

## Event Envelope

```ts
export type AgentEvent = {
  event_id: string;
  event_type: EventType;
  run_id: string;
  source_agent: AgentName;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

## Agent Result Envelope

```ts
export type AgentResult<T> = {
  run_id: string;
  agent: AgentName;
  status: "pending" | "running" | "completed" | "failed" | "needs_review";
  confidence: number;
  evidence_refs: string[];
  result: T;
  human_review_required: boolean;
};
```

## Agent Names

```ts
export const agentNames = [
  "assignment_architect",
  "student_memory_agent",
  "grouping_agent",
  "accessibility_agent",
  "assignment_curator",
  "assessment_agent",
  "classroom_evolution_agent",
  "lesson_planner",
] as const;
```

## Concepts

```ts
export type ConceptId =
  | "integer_operations"
  | "distributive_property"
  | "equation_sequencing"
  | "combining_like_terms";
```

## Student

```ts
export type Student = {
  student_id: string;
  display_name: string;
  avatar_key: string;
  supports: SupportId[];
  mastery: Record<ConceptId, MasteryEstimate>;
  recent_patterns: MisconceptionId[];
  scaffolding_level: 1 | 2 | 3 | 4;
  last_room?: RoomId;
};

export type MasteryEstimate = {
  score: number;
  confidence: number;
  trend: "rising" | "flat" | "falling";
};
```

## Room

```ts
export type Room = {
  room_id: RoomId;
  name: "Ember" | "Forge" | "Harbor" | "Summit";
  focus_concepts: ConceptId[];
  dominant_barrier: string;
  evidence_refs: string[];
  members: string[];
  base_adaptation: string;
  explanation: string;
};
```

## API Routes

```txt
POST /api/runs
GET  /api/runs/:runId
GET  /api/runs/:runId/events
POST /api/runs/:runId/simulate-submissions
POST /api/runs/:runId/approve-plan
GET  /api/students/:studentId
GET  /api/rooms/:roomId
```

## Run State

```ts
export type RunState = {
  run_id: string;
  status: "created" | "analyzing" | "grouped" | "variants_ready" | "assessed" | "planned";
  assignment: Assignment;
  concepts: ConceptSummary[];
  students: Student[];
  rooms: Room[];
  variants: AssignmentVariant[];
  assessments: AssessmentResult[];
  lesson_plan?: LessonPlan;
  review_queue: ReviewItem[];
  events: AgentEvent[];
};
```

## Frontend Event Mapping

| Event | Required visual response |
| --- | --- |
| `assignment.uploaded` | Professor gives document to guide. |
| `assignment.concepts.extracted` | Concept icons appear near assignment table. |
| `student.context.ready` | Memory Library glows and emits particles. |
| `groups.proposed` | Classroom foundations appear. |
| `accessibility.layers.ready` | Support badges appear on student detail cards. |
| `assignment.variants.ready` | Rooms finish building and scrolls appear. |
| `submissions.received` | Students carry work to Assessment Forge. |
| `assessment.completed` | Misconception icons rise from forge. |
| `student.models.updated` | Students move and room sizes change. |
| `lesson.plan.ready` | Tomorrow overlay appears at Planning Observatory. |
| `approval.requested` | Professor review panel opens. |
