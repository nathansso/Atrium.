/**
 * Curriculum research orchestration — the async seam between the route and the
 * pure agent.
 *
 * It retrieves grounded evidence from Firecrawl, records the research lifecycle as
 * Guild traces, opens the mandatory educator-review gate via `recordAgentRun`,
 * and persists the draft. The curriculum lifecycle rides on Guild traces and
 * draft state — it deliberately does NOT emit into the run `eventTypes` union,
 * which is a Phase-2 (coreLoop) concern.
 */
import {
  type AgentResult,
  type CurriculumApproval,
  type CurriculumApprovalRequest,
  type CurriculumDraft,
  type ResearchRequest,
} from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type {
  FirecrawlResearchAdapter,
  FirecrawlResearchResult,
  FirecrawlSearchQuery,
} from "@/server/adapters/types";
import { trace } from "@/server/platform/guildWorkflow";
import { recordAgentRun, registerAgents } from "@/server/sponsorBridge";
import { AGENT, runCurriculumResearchAgent } from "@/server/agents/curriculumResearch";
import type { GuildTraceInput } from "@/server/adapters/types";
import {
  getRecord,
  nextDraftId,
  putDraft,
  setApproval,
} from "./store";

/** No grounded evidence could be turned into a draft. */
export class CurriculumResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurriculumResearchError";
  }
}

/** A draft id was referenced that is not in the store. */
export class CurriculumNotFoundError extends Error {
  constructor(public readonly draftId: string) {
    super(`No curriculum draft with id "${draftId}".`);
    this.name = "CurriculumNotFoundError";
  }
}

export type ResearchOptions = {
  /** Injectable clock so drafts are deterministic in tests. */
  now?: () => string;
  /** Override the resolved adapter for isolated tests. */
  firecrawl?: FirecrawlResearchAdapter;
};

export type ResearchOutcome = {
  draft: CurriculumDraft;
  agent_result: AgentResult<CurriculumDraft>;
  provider: string;
  /** Always false: production research never substitutes fixture evidence. */
  degraded: boolean;
};

/** A Guild trace must never fail the research request. */
async function safeTrace(input: GuildTraceInput): Promise<void> {
  try {
    await trace(input);
  } catch (error) {
    console.warn(`[curriculum] guild trace failed (${input.action}):`, error);
  }
}

/** A recorded educator decision is immutable for this draft. */
export class CurriculumDecisionConflictError extends Error {
  constructor(
    public readonly draftId: string,
    public readonly existing: CurriculumApproval["state"],
    public readonly requested: "approved" | "rejected",
  ) {
    super(
      `Curriculum draft "${draftId}" is already ${existing}; it cannot be changed to ${requested}.`,
    );
    this.name = "CurriculumDecisionConflictError";
  }
}

/** Resolve only the review gate owned by this curriculum draft. */
async function safeResolveCurriculumGate(
  draftId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  try {
    const guild = getAdapters().guild;
    const gates = await guild.listApprovals(draftId);
    const gate =
      gates.find(
        (candidate) =>
          candidate.status === "pending" &&
          candidate.gate_type === "curriculum_draft" &&
          candidate.subject_id === draftId,
      ) ??
      gates.find(
        (candidate) =>
          candidate.status === "pending" &&
          candidate.gate_type === "low_confidence_grade" &&
          candidate.subject_id === AGENT,
      );
    if (gate) await guild.resolveApproval(gate.gate_id, decision);
  } catch (error) {
    console.warn(`[curriculum] guild approval resolution failed (${draftId}):`, error);
  }
}

export async function researchCurriculum(
  request: ResearchRequest,
  opts: ResearchOptions = {},
): Promise<ResearchOutcome> {
  const now = opts.now ?? (() => new Date().toISOString());
  const draftId = nextDraftId();
  const query: FirecrawlSearchQuery = {
    topic: request.topic,
    audience: request.audience,
    maxResults: request.max_sources,
    includeDomains: request.include_domains,
    excludeDomains: request.exclude_domains,
    fromDate: request.freshness_cutoff,
    teachingIntent: request.teaching_intent,
  };

  await registerAgents();
  await safeTrace({
    run_id: draftId,
    actor: AGENT,
    action: "curriculum.research.requested",
    details: { topic: request.topic, audience: request.audience },
  });

  const primary = opts.firecrawl ?? getAdapters().firecrawl;
  let research: FirecrawlResearchResult;
  try {
    research = await primary.research(query);
    if (research.claims.length === 0) {
      throw new Error("The research provider returned no grounded claims.");
    }
  } catch (error) {
    throw new CurriculumResearchError(
      error instanceof Error ? error.message : String(error),
    );
  }

  if (research.claims.length === 0) {
    throw new CurriculumResearchError(
      `No grounded claims were returned for topic "${request.topic}".`,
    );
  }

  await safeTrace({
    run_id: draftId,
    actor: AGENT,
    action: "curriculum.sources.collected",
    details: {
      source_count: research.sources.length,
      claim_count: research.claims.length,
      provider: research.provider,
      degraded: false,
    },
  });

  const agentResult = runCurriculumResearchAgent({
    run_id: draftId,
    request,
    sources: research.sources,
    claims: research.claims,
    draft_id: draftId,
    created_at: now(),
  });

  // Opens the Guild educator-review gate (human_review_required = true).
  await recordAgentRun(draftId, AGENT, agentResult);
  const draft = putDraft(agentResult.result);

  await safeTrace({
    run_id: draftId,
    actor: AGENT,
    action: "curriculum.draft.ready",
    review_gate: true,
    details: {
      chunk_count: draft.chunks.length,
      warning_count: draft.warnings.length,
    },
  });

  return { draft, agent_result: agentResult, provider: research.provider, degraded: false };
}

export type ApprovalOptions = { now?: () => string };

export type ApprovalOutcome = {
  draft: CurriculumDraft;
  approval: CurriculumApproval;
};

export async function approveCurriculum(
  draftId: string,
  request: CurriculumApprovalRequest,
  opts: ApprovalOptions = {},
): Promise<ApprovalOutcome> {
  const now = opts.now ?? (() => new Date().toISOString());
  const record = getRecord(draftId);
  if (!record) throw new CurriculumNotFoundError(draftId);

  const state = request.reject ? "rejected" : "approved";
  if (record.approval) {
    if (record.approval.state === state) {
      await safeResolveCurriculumGate(draftId, state);
      return { draft: record.draft, approval: record.approval };
    }
    throw new CurriculumDecisionConflictError(
      draftId,
      record.approval.state,
      state,
    );
  }
  const approval: CurriculumApproval = {
    draft_id: draftId,
    state,
    approved_by: request.approved_by,
    ...(request.note ? { note: request.note } : {}),
    decided_at: now(),
  };
  const updated = setApproval(draftId, approval);
  await safeResolveCurriculumGate(draftId, state);

  await safeTrace({
    run_id: draftId,
    actor: "professor",
    action: state === "approved" ? "curriculum.approved" : "curriculum.rejected",
    details: { approved_by: request.approved_by },
  });

  return { draft: updated?.draft ?? record.draft, approval };
}
