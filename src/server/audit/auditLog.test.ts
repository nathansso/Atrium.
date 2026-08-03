import { beforeEach, describe, expect, it } from "vitest";
import { getReviewGates, getRunAudit, recordAudit, resetAuditLog } from "./auditLog";

const RUN = "run_audit";

describe("audit log", () => {
  beforeEach(() => {
    resetAuditLog();
  });

  it("records agent, action, evidence refs, and review gate flag", () => {
    const entry = recordAudit({
      run_id: RUN,
      actor: "assessment_agent",
      action: "assessment.completed",
      evidence_refs: ["submission:s3:q2"],
      review_gate: true,
      details: { confidence: 0.52 },
    });

    expect(entry.audit_id).toMatch(/^aud_/);
    expect(entry.timestamp).toBeTruthy();
    expect(entry.actor).toBe("assessment_agent");
    expect(entry.evidence_refs).toEqual(["submission:s3:q2"]);
    expect(entry.review_gate).toBe(true);
  });

  it("returns run-scoped trails in record order", () => {
    recordAudit({ run_id: RUN, actor: "grouping_agent", action: "groups.proposed" });
    recordAudit({ run_id: "run_other", actor: "system", action: "noise" });
    recordAudit({ run_id: RUN, actor: "professor", action: "plan.approved" });

    const trail = getRunAudit(RUN);
    expect(trail).toHaveLength(2);
    expect(trail[0].action).toBe("groups.proposed");
    expect(trail[1].actor).toBe("professor");
  });

  it("filters review gates", () => {
    recordAudit({ run_id: RUN, actor: "grouping_agent", action: "groups.proposed" });
    recordAudit({ run_id: RUN, actor: "assessment_agent", action: "low_confidence", review_gate: true });

    const gates = getReviewGates(RUN);
    expect(gates).toHaveLength(1);
    expect(gates[0].action).toBe("low_confidence");
  });
});
