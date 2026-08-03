import {
  conceptIdSchema,
  misconceptionIds,
  roomIds,
  supportIds,
  type AssessmentResult,
  type Assignment,
  type AssignmentVariant,
  type ConceptId,
  type ConceptSummary,
  type LessonPlan,
  type MisconceptionId,
  type ReviewItem,
  type Room,
  type RoomId,
  type Student,
  type SupportId,
} from "@/contracts";

/**
 * Event payloads are `Record<string, unknown>` by contract, so the frontend
 * reads them defensively. Each reader accepts the canonical key first and then
 * a couple of near-miss shapes, and returns an empty result rather than
 * throwing. A malformed payload must never blank the world mid-demo.
 *
 * Canonical keys the backend branches should emit:
 *
 *   assignment.uploaded             { assignment }
 *   assignment.concepts.extracted   { concepts: ConceptSummary[] }
 *   student.context.ready           { students: Student[] }
 *   groups.proposed                 { rooms: Room[] }
 *   accessibility.layers.ready      { layers: [{ student_id, supports }] }
 *   assignment.variants.ready       { variants: AssignmentVariant[] }
 *   submissions.received            { submissions: [{ student_id, room_id }] }
 *   assessment.completed            { assessments: AssessmentResult[] }
 *   student.models.updated          { students: Student[], moves?: Move[] }
 *   lesson.plan.ready               { lesson_plan: LessonPlan }
 *   approval.requested              { review_queue: ReviewItem[] }
 */

type Payload = Record<string, unknown>;

function isRecord(value: unknown): value is Payload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickArray(payload: Payload, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pickRecord(payload: Payload, ...keys: string[]): Payload | null {
  for (const key of keys) {
    const value = payload[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function inList<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Concept IDs are run-scoped; only the room/support/misconception vocabularies are fixed. */
function asConceptId(value: unknown): ConceptId | null {
  const parsed = conceptIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readAssignment(payload: Payload): Assignment | null {
  const assignment = pickRecord(payload, "assignment");
  if (assignment && asString(assignment.assignment_id)) {
    return assignment as unknown as Assignment;
  }
  if (asString(payload.assignment_id)) return payload as unknown as Assignment;
  return null;
}

export function readConceptIds(payload: Payload): ConceptId[] {
  const entries = pickArray(payload, "concepts", "concept_summaries", "concept_ids");
  const out: ConceptId[] = [];
  for (const entry of entries) {
    const raw = isRecord(entry) ? entry.concept_id ?? entry.id : entry;
    const id = asConceptId(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function readConceptSummaries(payload: Payload): ConceptSummary[] {
  const entries = pickArray(payload, "concepts", "concept_summaries");
  const out: ConceptSummary[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const id = asConceptId(entry.concept_id ?? entry.id);
    if (!id) continue;
    out.push({
      concept_id: id,
      label: asString(entry.label) ?? humanize(id),
      description: asString(entry.description) ?? "",
      problem_refs: pickArray(entry, "problem_refs").filter(
        (ref): ref is string => typeof ref === "string",
      ),
      prerequisite_of: pickArray(entry, "prerequisite_of")
        .map(asConceptId)
        .filter((ref): ref is ConceptId => ref !== null),
    } as unknown as ConceptSummary);
  }
  return out;
}

export function readStudents(payload: Payload): Student[] {
  const entries = pickArray(payload, "students", "student_contexts");
  const out: Student[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.student_id);
    if (!id) continue;
    out.push(entry as unknown as Student);
  }
  return out;
}

export function readRooms(payload: Payload): Room[] {
  const entries = pickArray(payload, "rooms", "groups");
  const out: Room[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (!inList(roomIds, entry.room_id)) continue;
    out.push(entry as unknown as Room);
  }
  return out;
}

export type SupportLayer = { student_id: string; supports: SupportId[] };

export function readSupportLayers(payload: Payload): SupportLayer[] {
  const entries = pickArray(
    payload,
    "layers",
    "accessibility_layers",
    "student_layers",
    "students",
  );
  const out: SupportLayer[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.student_id);
    if (!id) continue;
    const supports = pickArray(entry, "supports", "supports_applied")
      .map((value) => inList(supportIds, value))
      .filter((value): value is SupportId => value !== null);
    out.push({ student_id: id, supports });
  }
  return out;
}

export function readVariants(payload: Payload): AssignmentVariant[] {
  const entries = pickArray(payload, "variants", "assignment_variants");
  const out: AssignmentVariant[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (!inList(roomIds, entry.room_id)) continue;
    out.push(entry as unknown as AssignmentVariant);
  }
  return out;
}

export type SubmissionRef = { student_id: string; room_id?: RoomId };

export function readSubmissions(payload: Payload): SubmissionRef[] {
  const entries = pickArray(payload, "submissions", "students", "student_ids");
  const out: SubmissionRef[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      out.push({ student_id: entry });
      continue;
    }
    if (!isRecord(entry)) continue;
    const id = asString(entry.student_id);
    if (!id) continue;
    out.push({ student_id: id, room_id: inList(roomIds, entry.room_id) ?? undefined });
  }
  return out;
}

export function readAssessments(payload: Payload): AssessmentResult[] {
  const entries = pickArray(payload, "assessments", "results");
  const out: AssessmentResult[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (!asString(entry.student_id)) continue;
    out.push(entry as unknown as AssessmentResult);
  }
  return out;
}

export function readMisconceptions(payload: Payload): MisconceptionId[] {
  const direct = pickArray(payload, "misconceptions")
    .map((value) => inList(misconceptionIds, value))
    .filter((value): value is MisconceptionId => value !== null);
  if (direct.length > 0) return unique(direct);

  const fromAssessments = readAssessments(payload).flatMap((assessment) =>
    Array.isArray(assessment.misconceptions) ? assessment.misconceptions : [],
  );
  return unique(
    fromAssessments.filter((value): value is MisconceptionId =>
      inList(misconceptionIds, value) !== null,
    ),
  );
}

export type StudentMove = {
  student_id: string;
  from_room?: RoomId;
  to_room?: RoomId;
};

export function readMoves(payload: Payload): StudentMove[] {
  const explicit = pickArray(payload, "moves", "regrouping");
  const out: StudentMove[] = [];
  for (const entry of explicit) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.student_id);
    if (!id) continue;
    out.push({
      student_id: id,
      from_room: inList(roomIds, entry.from_room ?? entry.from) ?? undefined,
      to_room: inList(roomIds, entry.to_room ?? entry.to) ?? undefined,
    });
  }
  if (out.length > 0) return out;

  // Fall back to reading final placement off the updated student models.
  for (const student of readStudents(payload)) {
    const to = inList(roomIds, student.last_room);
    if (to) out.push({ student_id: student.student_id, to_room: to });
  }
  return out;
}

export function readLessonPlan(payload: Payload): LessonPlan | null {
  const plan = pickRecord(payload, "lesson_plan", "plan");
  if (plan && Array.isArray(plan.items)) return plan as unknown as LessonPlan;
  if (plan && Array.isArray(plan.timeline)) return plan as unknown as LessonPlan;
  if (Array.isArray(payload.items)) return payload as unknown as LessonPlan;
  if (Array.isArray(payload.timeline)) return payload as unknown as LessonPlan;
  return null;
}

export function readReviewItems(payload: Payload): ReviewItem[] {
  const entries = pickArray(payload, "review_queue", "reviews", "items");
  const out: ReviewItem[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (!asString(entry.review_id)) continue;
    out.push(entry as unknown as ReviewItem);
  }
  const single = pickRecord(payload, "review", "review_item");
  if (out.length === 0 && single && asString(single.review_id)) {
    out.push(single as unknown as ReviewItem);
  }
  return out;
}

export function humanize(value: string): string {
  return value
    .split(/[_.:-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
