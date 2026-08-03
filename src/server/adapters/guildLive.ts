/**
 * Live Guild.ai adapter — the agent layer's human-in-the-loop gates.
 *
 * Guild has no npm SDK we can import here: `@guildai/agents-sdk` is the
 * runtime for writing agent code that *runs inside Guild's sandbox*, not a
 * client library for calling agents from an external app (see
 * docs.guild.ai/guide/sdk-introduction — agents "run in a sandboxed
 * environment" and cannot import external packages). The only externally
 * callable surface is Guild's Trigger REST API: HTTP Basic Auth against a
 * per-agent "API trigger" credential (docs.guild.ai/platform/triggers).
 *
 * The eight specialist agents already exist in the mem-in-motion/atrium
 * workspace (built by the team directly on Guild, prompts and handoffs
 * mirroring src/server/agents/*.ts). Registering an agent, recording a
 * handoff, or recording a trace has no external Guild endpoint — those are
 * internal to how a session runs a sub-agent — so this adapter keeps that
 * bookkeeping local, same as guildMock.ts. The one thing genuinely worth
 * making live is Guild's headline feature: the two mandatory approval gates.
 * requestApproval starts
 * a real session on the gated agent (assessment-agent or lesson-planner),
 * which can pause on `ui_prompt` exactly as its PROMPT.md describes;
 * resolveApproval both unblocks our own UI and forwards the decision into
 * that session so the paused agent can finish.
 */
import { agentNames, type AgentName } from "@/contracts";
import { getEnvConfig } from "@/server/config";
import type {
  AdapterInfo,
  AgentHandoff,
  ApprovalGate,
  ApprovalGateType,
  GuildAgentAdapter,
  GuildAgentRecord,
  GuildRunRecord,
  GuildTrace,
} from "./types";

const GUILD_API_BASE = "https://app.guild.ai/api";

const DEFAULT_PERMISSIONS: Record<AgentName, string[]> = {
  assignment_architect: ["read:assignment", "write:concepts"],
  student_memory_agent: ["read:students", "read:observations"],
  grouping_agent: ["read:context", "write:rooms"],
  accessibility_agent: ["read:supports", "write:layers"],
  assignment_curator: ["read:rooms", "write:variants"],
  assessment_agent: ["read:submissions", "write:assessments", "request:review"],
  classroom_evolution_agent: ["read:assessments", "write:mastery", "write:rooms"],
  lesson_planner: ["read:mastery", "write:plan", "request:review"],
  curriculum_research_agent: ["read:sources", "write:curriculum", "request:review"],
};

/** Which specialist agent backs each gate, and which env credential calls it. */
const GATE_AGENT: Record<ApprovalGateType, AgentName> = {
  low_confidence_grade: "assessment_agent",
  final_plan: "lesson_planner",
  curriculum_draft: "lesson_planner",
};

function guildSlug(agent: AgentName): string {
  return agent.replace(/_/g, "-");
}

function credentialFor(gateType: ApprovalGateType): string {
  const config = getEnvConfig();
  const key =
    gateType === "low_confidence_grade"
      ? config.guildApiKey
      : config.guildLessonPlannerApiKey;
  if (!key || !config.guildWorkspace) {
    throw new Error(
      `Guild credentials missing for gate "${gateType}" — GUILD_API_KEY, GUILD_LESSON_PLANNER_API_KEY, and GUILD_WORKSPACE are all required for live mode.`,
    );
  }
  return key;
}

function workspacePath(): string {
  const { guildWorkspace } = getEnvConfig();
  if (!guildWorkspace) {
    throw new Error("GUILD_WORKSPACE is required for live mode.");
  }
  return guildWorkspace;
}

async function guildFetch<T>(path: string, credential: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GUILD_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credential).toString("base64")}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Guild API ${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }
  return (await response.json()) as T;
}

type GuildSession = { id: string; [key: string]: unknown };

/** Builds the review request an LLM agent reads to decide whether to pause. */
function reviewPrompt(input: {
  gate_type: ApprovalGateType;
  subject_id: string;
  reason: string;
  evidence_refs: string[];
}): string {
  const reviewSubject =
    input.gate_type === "final_plan"
      ? "final lesson plan"
      : input.gate_type === "curriculum_draft"
        ? "cited curriculum draft"
        : "low-confidence grade";
  const lines = [
    `Atrium is asking you to act as the human-review gate for a ${reviewSubject}.`,
    `Subject: ${input.subject_id}`,
    `Reason for review: ${input.reason}`,
  ];
  if (input.evidence_refs.length > 0) {
    lines.push(`Evidence: ${input.evidence_refs.join(", ")}`);
  }
  lines.push(
    input.gate_type === "curriculum_draft"
      ? "This cited draft has already been assembled locally and only needs the educator approval gate. Call ui_prompt to present the reason and evidence, then wait for the reply. Do not launch a classroom run."
      : "This has already been graded/planned locally and only needs your approval gate. Call ui_prompt to put this in front of the professor with the reason and evidence above, then wait for the reply. Do not redo the grading or planning yourself.",
  );
  return lines.join("\n");
}

type GuildLiveState = {
  agents: Map<AgentName, GuildAgentRecord>;
  runs: GuildRunRecord[];
  handoffs: AgentHandoff[];
  gates: ApprovalGate[];
  traces: GuildTrace[];
  handoffCounter: number;
  traceCounter: number;
  /** Which trigger credential opened each gate's session, for resolveApproval. */
  gateCredential: Map<string, string>;
};

const GLOBAL_KEY = "__atrium_guild_live__";

function getState(): GuildLiveState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      agents: new Map(),
      runs: [],
      handoffs: [],
      gates: [],
      traces: [],
      handoffCounter: 0,
      traceCounter: 0,
      gateCredential: new Map(),
    } satisfies GuildLiveState;
  }
  return store[GLOBAL_KEY] as GuildLiveState;
}

export function createLiveGuildAdapter(): GuildAgentAdapter {
  const adapter: GuildAgentAdapter = {
    info(): AdapterInfo {
      return { name: "guild", mode: "live", provider: "guild-trigger-api" };
    },

    // Guild has no external "register an agent" endpoint — the eight agents
    // already exist in the workspace with their own permissions. This stays
    // local bookkeeping so callers get the same audit trail as the mock.
    async registerAgent(agent, permissions) {
      const state = getState();
      const existing = state.agents.get(agent);
      if (existing) return existing;
      const record: GuildAgentRecord = {
        agent,
        registered_at: new Date().toISOString(),
        permissions: permissions ?? DEFAULT_PERMISSIONS[agent] ?? [],
      };
      state.agents.set(agent, record);
      await adapter.recordTrace({ run_id: "global", actor: "system", action: `guild.register_agent:${agent}` });
      return record;
    },

    async registerDefaultAgents() {
      const records: GuildAgentRecord[] = [];
      for (const agent of agentNames) records.push(await adapter.registerAgent(agent));
      return records;
    },

    async listAgents() {
      return [...getState().agents.values()];
    },

    async recordAgentRun(record) {
      const state = getState();
      const stored: GuildRunRecord = { ...record, recorded_at: new Date().toISOString() };
      state.runs.push(stored);
      await adapter.recordTrace({
        run_id: record.run_id,
        actor: record.agent,
        action: `guild.agent_run:${record.status}`,
        evidence_refs: record.evidence_refs,
        review_gate: record.human_review_required,
        details: { confidence: record.confidence },
      });
      if (record.human_review_required) {
        const curriculumReview = record.agent === "curriculum_research_agent";
        await adapter.requestApproval({
          run_id: record.run_id,
          gate_type:
            record.agent === "lesson_planner"
              ? "final_plan"
              : curriculumReview
                ? "curriculum_draft"
                : "low_confidence_grade",
          subject_id: curriculumReview ? record.run_id : record.agent,
          reason: curriculumReview
            ? `Curriculum draft ${record.run_id} requires educator review before it can become student-facing.`
            : `Agent ${record.agent} finished with confidence ${record.confidence.toFixed(2)} and requires professor review.`,
          evidence_refs: record.evidence_refs,
        });
      }
      return stored;
    },

    async getAgentRuns(runId) {
      return getState().runs.filter((run) => run.run_id === runId);
    },

    async handoff(input) {
      const state = getState();
      state.handoffCounter += 1;
      const handoff: AgentHandoff = {
        handoff_id: `handoff_${String(state.handoffCounter).padStart(3, "0")}`,
        ...input,
        at: new Date().toISOString(),
      };
      state.handoffs.push(handoff);
      await adapter.recordTrace({
        run_id: input.run_id,
        actor: input.from_agent,
        action: `guild.handoff:${input.to_agent}`,
        evidence_refs: input.payload_refs,
        details: { handoff_id: handoff.handoff_id, reason: input.reason },
      });
      return handoff;
    },

    async listHandoffs(runId) {
      return getState().handoffs.filter((handoff) => handoff.run_id === runId);
    },

    async requestApproval(input) {
      const evidence_refs = input.evidence_refs ?? [];
      const credential = credentialFor(input.gate_type);
      const agentSlug = guildSlug(GATE_AGENT[input.gate_type]);

      const session = await guildFetch<GuildSession>(
        `/workspaces/${workspacePath()}/sessions`,
        credential,
        {
          method: "POST",
          body: JSON.stringify({
            session_type: "api_trigger",
            agent_input: {
              text: reviewPrompt({ gate_type: input.gate_type, subject_id: input.subject_id, reason: input.reason, evidence_refs }),
            },
          }),
        },
      );

      const gate: ApprovalGate = {
        gate_id: session.id,
        run_id: input.run_id,
        gate_type: input.gate_type,
        subject_id: input.subject_id,
        reason: input.reason,
        evidence_refs,
        status: "pending",
        requested_at: new Date().toISOString(),
        resolved_at: null,
      };

      const state = getState();
      state.gates.push(gate);
      state.gateCredential.set(gate.gate_id, credential);
      await adapter.recordTrace({
        run_id: input.run_id,
        actor: "system",
        action: `guild.approval_requested:${input.gate_type}`,
        evidence_refs,
        review_gate: true,
        details: { gate_id: gate.gate_id, subject_id: gate.subject_id, session_id: session.id, agent: agentSlug },
      });
      return gate;
    },

    async listApprovals(runId) {
      return getState().gates.filter((gate) => gate.run_id === runId);
    },

    async resolveApproval(gateId, decision) {
      const state = getState();
      const gate = state.gates.find((candidate) => candidate.gate_id === gateId);
      if (!gate) return null;

      const credential = state.gateCredential.get(gateId);
      if (credential) {
        // Forward the decision into the paused Guild session so its
        // ui_prompt call gets an answer and the agent can finish. Best
        // effort: our own gate state is the source of truth for Atrium's UI
        // regardless of whether Guild's session has already timed out.
        await guildFetch(`/sessions/${gateId}/events`, credential, {
          method: "POST",
          body: JSON.stringify({
            mode: "text",
            content:
              decision === "approved"
                ? "Approved. Proceed."
                : "Rejected. Do not publish; hold for revision.",
          }),
        }).catch((error: unknown) => {
          void adapter.recordTrace({
            run_id: gate.run_id,
            actor: "system",
            action: "guild.approval_forward_failed",
            details: { gate_id: gate.gate_id, error: error instanceof Error ? error.message : String(error) },
          });
        });
      }

      gate.status = decision;
      gate.resolved_at = new Date().toISOString();
      await adapter.recordTrace({
        run_id: gate.run_id,
        actor: "professor",
        action: `guild.approval_${decision}:${gate.gate_type}`,
        details: { gate_id: gate.gate_id },
      });
      return gate;
    },

    async recordTrace(input) {
      const state = getState();
      state.traceCounter += 1;
      const trace: GuildTrace = {
        trace_id: `gtrace_${String(state.traceCounter).padStart(4, "0")}`,
        timestamp: new Date().toISOString(),
        evidence_refs: input.evidence_refs ?? [],
        review_gate: input.review_gate ?? false,
        ...input,
      };
      state.traces.push(trace);
      return trace;
    },

    async listTraces(runId) {
      return getState().traces.filter((trace) => trace.run_id === runId);
    },
  };

  return adapter;
}

/** Test/demo-reset helper. No network connection to close — every call is a plain fetch. */
export function resetLiveGuild(): void {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
}
