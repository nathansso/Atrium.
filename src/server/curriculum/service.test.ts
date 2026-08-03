import { beforeEach, describe, expect, it, vi } from "vitest";
import { curriculumApprovalRequestSchema, researchRequestSchema } from "@/contracts";
import { getAdapters, resetAdapters } from "@/server/adapters";
import type { FirecrawlResearchAdapter } from "@/server/adapters/types";
import {
  approveCurriculum,
  CurriculumDecisionConflictError,
  CurriculumNotFoundError,
  CurriculumResearchError,
  researchCurriculum,
} from "./service";
import { getDraft, resetCurriculumStore } from "./store";

const request = researchRequestSchema.parse({
  topic: "AI literacy",
  audience: "high school",
});
const fixedNow = () => "2026-08-03T00:00:00.000Z";

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPONSOR_MODE", "");
  await resetAdapters();
  resetCurriculumStore();
});

describe("researchCurriculum", () => {
  it("produces a cited draft, persists it, and opens an educator review gate", async () => {
    const outcome = await researchCurriculum(request, { now: fixedNow });

    expect(outcome.draft.draft_id).toBe("draft_0001");
    expect(outcome.draft.chunks.length).toBeGreaterThan(0);
    expect(outcome.draft.approval_state).toBe("pending");
    expect(outcome.agent_result.human_review_required).toBe(true);

    // Persisted under a stable id.
    expect(getDraft("draft_0001")?.topic).toBe("AI literacy");

    // The Guild educator-review gate is open.
    const gates = await getAdapters().guild.listApprovals("draft_0001");
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      gate_type: "curriculum_draft",
      subject_id: "draft_0001",
      status: "pending",
    });

    // The research lifecycle is recorded as Guild traces.
    const actions = (await getAdapters().guild.listTraces("draft_0001")).map((t) => t.action);
    expect(actions).toContain("curriculum.research.requested");
    expect(actions).toContain("curriculum.sources.collected");
    expect(actions).toContain("curriculum.draft.ready");
  });

  it("fails rather than substituting fixture evidence when Firecrawl is unavailable", async () => {
    const failing: FirecrawlResearchAdapter = {
      info: () => ({ name: "firecrawl", mode: "live", provider: "firecrawl-search" }),
      research: async () => {
        throw new Error("provider unreachable");
      },
    };

    await expect(researchCurriculum(request, { now: fixedNow, firecrawl: failing })).rejects.toThrow(
      "provider unreachable",
    );
  });

  it("rejects live responses with no grounded claims", async () => {
    const empty: FirecrawlResearchAdapter = {
      info: () => ({ name: "firecrawl", mode: "live", provider: "firecrawl-search" }),
      research: async () => ({
        provider: "firecrawl-search",
        deterministic: false,
        sources: [],
        claims: [],
      }),
    };

    await expect(researchCurriculum(request, { now: fixedNow, firecrawl: empty })).rejects.toThrow(
      "no grounded claims",
    );
  });

  it("fails clearly instead of relabeling the AI-literacy mock", async () => {
    const unsupported = researchRequestSchema.parse({
      topic: "photosynthesis",
      audience: "high school",
    });

    await expect(researchCurriculum(unsupported, { now: fixedNow })).rejects.toThrow(
      CurriculumResearchError,
    );
  });
});

describe("approveCurriculum", () => {
  it("records an approval and folds it onto the stored draft", async () => {
    const { draft } = await researchCurriculum(request, { now: fixedNow });

    const { draft: approved, approval } = await approveCurriculum(
      draft.draft_id,
      curriculumApprovalRequestSchema.parse({ approved_by: "Ms. Rivera" }),
      { now: () => "2026-08-03T01:00:00.000Z" },
    );

    expect(approval.state).toBe("approved");
    expect(approval.approved_by).toBe("Ms. Rivera");
    expect(approved.approval_state).toBe("approved");
    expect(getDraft(draft.draft_id)?.approval_state).toBe("approved");
    const [gate] = await getAdapters().guild.listApprovals(draft.draft_id);
    expect(gate).toMatchObject({ gate_type: "curriculum_draft", status: "approved" });
    const actions = (await getAdapters().guild.listTraces(draft.draft_id)).map(
      (entry) => entry.action,
    );
    expect(actions).toContain("guild.approval_approved:curriculum_draft");
  });

  it("supports rejection", async () => {
    const { draft } = await researchCurriculum(request, { now: fixedNow });
    const { draft: rejected } = await approveCurriculum(
      draft.draft_id,
      curriculumApprovalRequestSchema.parse({ reject: true }),
      { now: fixedNow },
    );
    expect(rejected.approval_state).toBe("rejected");
    const [gate] = await getAdapters().guild.listApprovals(draft.draft_id);
    expect(gate).toMatchObject({ gate_type: "curriculum_draft", status: "rejected" });
  });

  it("keeps identical retries idempotent and rejects a conflicting decision", async () => {
    const { draft } = await researchCurriculum(request, { now: fixedNow });
    const first = await approveCurriculum(
      draft.draft_id,
      curriculumApprovalRequestSchema.parse({ approved_by: "Ms. Rivera" }),
      { now: () => "2026-08-03T01:00:00.000Z" },
    );
    const retry = await approveCurriculum(
      draft.draft_id,
      curriculumApprovalRequestSchema.parse({ approved_by: "Ms. Rivera" }),
      { now: () => "2026-08-03T02:00:00.000Z" },
    );

    expect(retry.approval).toEqual(first.approval);
    await expect(
      approveCurriculum(
        draft.draft_id,
        curriculumApprovalRequestSchema.parse({ reject: true }),
      ),
    ).rejects.toBeInstanceOf(CurriculumDecisionConflictError);
    const [gate] = await getAdapters().guild.listApprovals(draft.draft_id);
    expect(gate.status).toBe("approved");
  });

  it("throws CurriculumNotFoundError for an unknown draft", async () => {
    await expect(
      approveCurriculum("draft_missing", curriculumApprovalRequestSchema.parse({})),
    ).rejects.toBeInstanceOf(CurriculumNotFoundError);
  });
});
