/**
 * Lesson plan approval — Person C owned.
 *
 * Stores the professor's approval on the lesson plan, resolves the final-plan
 * review gate, and records the decision on Person D's audit trail. Grades
 * held as needs_review stay pending — approving the plan never publishes a
 * low-confidence grade.
 */
import type { RunState } from "@/contracts";
import { getRunAudit, recordAudit } from "@/server/audit";
import type { AuditEntry } from "@/server/audit";
import { getRun, saveRun } from "./runProvider";

export type ApprovePlanInput = {
  approved_by?: string;
  note?: string;
};

export type ApprovePlanResult =
  | { ok: true; run: RunState; audit: AuditEntry[] }
  | { ok: false; error: "run_not_found" | "no_lesson_plan" };

export function approvePlan(runId: string, input: ApprovePlanInput = {}): ApprovePlanResult {
  const run = getRun(runId);
  if (!run) return { ok: false, error: "run_not_found" };
  if (!run.lesson_plan) return { ok: false, error: "no_lesson_plan" };

  run.lesson_plan.approval_state = "approved";
  for (const item of run.review_queue) {
    if (item.review_type === "final_plan" && item.status === "pending") {
      item.status = "approved";
    }
  }

  recordAudit({
    run_id: run.run_id,
    actor: "professor",
    action: "lesson_plan.approved",
    evidence_refs: run.lesson_plan.evidence_refs,
    details: {
      approved_by: input.approved_by ?? "professor",
      ...(input.note ? { note: input.note } : {}),
    },
  });

  saveRun(run);
  return { ok: true, run, audit: getRunAudit(run.run_id) };
}
