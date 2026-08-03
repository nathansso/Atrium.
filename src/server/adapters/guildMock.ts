/**
 * Mock Guild.ai adapter: in-memory agent registry, run records, explicit
 * handoffs, and human approval gates. Every action is mirrored into the
 * audit log.
 *
 * The interface is async because the live Guild SDK is; the mock keeps the
 * same shape so lanes can swap implementations without touching callers.
 */
import { agentNames, type AgentName } from "@/contracts";
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

type GuildState = {
  agents: Map<AgentName, GuildAgentRecord>;
  runs: GuildRunRecord[];
  gates: ApprovalGate[];
  handoffs: AgentHandoff[];
  traces: GuildTrace[];
  traceCounter: number;
  gateCounter: number;
  handoffCounter: number;
};

const GLOBAL_KEY = "__atrium_guild_mock__";

function getState(): GuildState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      agents: new Map(),
      runs: [],
      gates: [],
      handoffs: [],
      traces: [],
      traceCounter: 0,
      gateCounter: 0,
      handoffCounter: 0,
    } satisfies GuildState;
  }
  return store[GLOBAL_KEY] as GuildState;
}

function gateTypeForAgent(agent: AgentName): ApprovalGateType {
  if (agent === "lesson_planner") return "final_plan";
  if (agent === "curriculum_research_agent") return "curriculum_draft";
  return "low_confidence_grade";
}

export function createMockGuildAdapter(): GuildAgentAdapter {
  const adapter: GuildAgentAdapter = {
    info(): AdapterInfo {
      return { name: "guild", mode: "mock", provider: "in-memory" };
    },

    async registerAgent(agent, permissions) {
      const state = getState();
      const existing = state.agents.get(agent);
      if (existing) {
        return existing;
      }
      const record: GuildAgentRecord = {
        agent,
        registered_at: new Date().toISOString(),
        permissions: permissions ?? DEFAULT_PERMISSIONS[agent] ?? [],
      };
      state.agents.set(agent, record);
      await adapter.recordTrace({
        run_id: "global",
        actor: "system",
        action: `guild.register_agent:${agent}`,
      });
      return record;
    },

    async registerDefaultAgents() {
      const records: GuildAgentRecord[] = [];
      for (const agent of agentNames) {
        records.push(await adapter.registerAgent(agent));
      }
      return records;
    },

    async listAgents() {
      return [...getState().agents.values()];
    },

    async recordAgentRun(record) {
      const stored: GuildRunRecord = {
        ...record,
        recorded_at: new Date().toISOString(),
      };
      getState().runs.push(stored);
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
          gate_type: gateTypeForAgent(record.agent),
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
      const state = getState();
      state.gateCounter += 1;
      const gate: ApprovalGate = {
        gate_id: `gate_${String(state.gateCounter).padStart(3, "0")}`,
        run_id: input.run_id,
        gate_type: input.gate_type,
        subject_id: input.subject_id,
        reason: input.reason,
        evidence_refs: input.evidence_refs ?? [],
        status: "pending",
        requested_at: new Date().toISOString(),
        resolved_at: null,
      };
      state.gates.push(gate);
      await adapter.recordTrace({
        run_id: input.run_id,
        actor: "system",
        action: `guild.approval_requested:${input.gate_type}`,
        evidence_refs: gate.evidence_refs,
        review_gate: true,
        details: { gate_id: gate.gate_id, subject_id: gate.subject_id },
      });
      return gate;
    },

    async listApprovals(runId) {
      return getState().gates.filter((gate) => gate.run_id === runId);
    },

    async resolveApproval(gateId, decision) {
      const gate = getState().gates.find((candidate) => candidate.gate_id === gateId);
      if (!gate) {
        return null;
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

/** Test/demo-reset helper. */
export function resetMockGuild(): void {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
}
