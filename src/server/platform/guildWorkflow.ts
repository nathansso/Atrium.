/** Guild.ai control plane: agent registry, handoffs, approvals, and traces. */
import type { AgentName, AgentResult } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type { GuildTrace, GuildTraceInput } from "@/server/adapters";

export async function registerGuildAgents(): Promise<void> {
  await getAdapters().guild.registerDefaultAgents();
}

export async function trace(input: GuildTraceInput): Promise<GuildTrace> {
  return getAdapters().guild.recordTrace(input);
}

export async function recordGuildAgentResult(runId: string, agent: AgentName, result: AgentResult<unknown>): Promise<void> {
  await getAdapters().guild.recordAgentRun({ run_id: runId, agent, status: result.status, confidence: result.confidence, evidence_refs: result.evidence_refs.slice(0, 8), human_review_required: result.human_review_required });
}

export async function resolveGuildApproval(gateId: string, decision: "approved" | "rejected") {
  return getAdapters().guild.resolveApproval(gateId, decision);
}

export async function getGuildTraces(runId: string): Promise<GuildTrace[]> {
  return getAdapters().guild.listTraces(runId);
}
