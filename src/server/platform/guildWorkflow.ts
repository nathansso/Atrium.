/** Guild.ai control plane: agent registry, handoffs, approvals, and traces. */
import type { AgentName, AgentResult } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type { ApprovalGateType, GuildTrace, GuildTraceInput } from "@/server/adapters";

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

/**
 * Resolve every pending gate of one type on a run. The local `review_queue`
 * item is a separate, run-scoped concept from Guild's own gate — this is
 * the seam that closes a gate on Guild's side (unblocking a real `ui_prompt`
 * pause in live mode) whenever the matching local review item is decided.
 */
export async function resolveGuildApprovalsForRun(
  runId: string,
  gateType: ApprovalGateType,
  decision: "approved" | "rejected",
): Promise<void> {
  const gates = await getAdapters().guild.listApprovals(runId);
  const pending = gates.filter((gate) => gate.gate_type === gateType && gate.status === "pending");
  await Promise.all(pending.map((gate) => resolveGuildApproval(gate.gate_id, decision)));
}

export async function getGuildTraces(runId: string): Promise<GuildTrace[]> {
  return getAdapters().guild.listTraces(runId);
}
