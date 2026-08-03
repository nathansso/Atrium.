/**
 * In-memory curriculum-draft store.
 *
 * Mirrors `runStore`: a `Map` pinned to `globalThis` via a `Symbol.for` key so
 * route handlers, hot reloads, and tests share one instance. Demo-only — the
 * issue calls for durable persistence (drafts, approvals, traces) before
 * production, behind this same function surface.
 */
import {
  curriculumDraftSchema,
  type CurriculumApproval,
  type CurriculumDraft,
  type CurriculumLaunch,
} from "@/contracts";

const STORE_KEY = Symbol.for("atrium.curriculumStore");

export type CurriculumRecord = {
  draft: CurriculumDraft;
  approval: CurriculumApproval | null;
  launch: CurriculumLaunch | null;
};

type CurriculumStore = {
  records: Map<string, CurriculumRecord>;
  counter: number;
};

function store(): CurriculumStore {
  const g = globalThis as unknown as Record<symbol, CurriculumStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { records: new Map(), counter: 0 };
  }
  return g[STORE_KEY]!;
}

/** Deterministic, monotonic draft id: `draft_0001`, `draft_0002`, … */
export function nextDraftId(): string {
  const s = store();
  s.counter += 1;
  return `draft_${String(s.counter).padStart(4, "0")}`;
}

export function putDraft(draft: CurriculumDraft): CurriculumDraft {
  const validated = curriculumDraftSchema.parse(draft);
  store().records.set(validated.draft_id, { draft: validated, approval: null, launch: null });
  return validated;
}

export function getRecord(draftId: string): CurriculumRecord | undefined {
  return store().records.get(draftId);
}

export function getDraft(draftId: string): CurriculumDraft | undefined {
  return store().records.get(draftId)?.draft;
}

export function listDrafts(): CurriculumDraft[] {
  return [...store().records.values()].map((record) => record.draft);
}

/** Persist an approval decision and fold its state onto the stored draft. */
export function setApproval(
  draftId: string,
  approval: CurriculumApproval,
): CurriculumRecord | undefined {
  const s = store();
  const record = s.records.get(draftId);
  if (!record) return undefined;
  const draft = curriculumDraftSchema.parse({
    ...record.draft,
    approval_state: approval.state,
  });
  const updated: CurriculumRecord = { ...record, draft, approval };
  s.records.set(draftId, updated);
  return updated;
}

/** Resolve an active lesson run back to its curriculum launch sequence. */
export function findRecordByLessonRun(runId: string): CurriculumRecord | undefined {
  return [...store().records.values()].find((record) =>
    record.launch?.lesson_runs.some((lesson) => lesson.run_id === runId),
  );
}

/** Persist the idempotent launch record after the core run is created. */
export function setLaunch(draftId: string, launch: CurriculumLaunch): CurriculumRecord | undefined {
  const s = store();
  const record = s.records.get(draftId);
  if (!record) return undefined;
  const updated: CurriculumRecord = { ...record, launch };
  s.records.set(draftId, updated);
  return updated;
}

/** Test/demo reset. */
export function resetCurriculumStore(): void {
  const g = globalThis as unknown as Record<symbol, CurriculumStore | undefined>;
  delete g[STORE_KEY];
}
