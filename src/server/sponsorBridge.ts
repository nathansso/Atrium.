/**
 * The bridge between the deterministic domain loop and the sponsor adapters.
 *
 * Why this file exists: every agent is a synchronous pure function and every
 * adapter method is async. Rather than make eight agents async — a wide change
 * that would touch every agent test — the loop stays synchronous and drains
 * into the sponsors at stage boundaries through the helpers here.
 *
 * The trade is deliberate. Events reach LaserData in run order, one batch per
 * stage, instead of one call per emit. Ordering is preserved because
 * `RunState.events` is already an ordered log; we simply publish the tail we
 * have not published yet.
 *
 * Every helper is best-effort: a sponsor being down degrades that layer and
 * never fails the run. That is the same guarantee `resolveAdapterMode()` makes
 * one level down, and it is what keeps the demo alive when venue wifi dies.
 */
import type { AgentName, AgentResult, RunState } from "@/contracts";
import type { PipelineTask } from "@/server/adapters";
import {
  executePipeline,
  publishRunEvents,
  resetDataPlaneProgress,
  writeSubmissionActivities,
} from "@/server/platform/rocketRideDataPlane";
import {
  recordGuildAgentResult,
  registerGuildAgents,
  trace,
} from "@/server/platform/guildWorkflow";

/** Per-run high-water mark of events already published to the stream. */
/**
 * Publish every event appended since the last call onto the run's topic.
 *
 * Idempotent by high-water mark, so calling it after each stage never
 * double-publishes. Laser delivery is at-least-once regardless, which is why
 * consumers must stay idempotent.
 */
export async function drainEventsToStream(state: RunState): Promise<number> {
  try {
    return await publishRunEvents(state);
  } catch (error) {
    // A dead stream costs the live layer, not the run.
    console.warn(`[sponsor] laser publish failed for ${state.run_id}:`, error);
    return 0;
  }
}

/**
 * Record one agent's envelope with Guild.
 *
 * `recordAgentRun` opens an approval gate on its own when the envelope asks
 * for human review, so low-confidence work pauses without the loop knowing
 * anything about gates.
 */
export async function recordAgentRun(
  runId: string,
  agent: AgentName,
  result: AgentResult<unknown>,
): Promise<void> {
  try {
    await recordGuildAgentResult(runId, agent, result);
  } catch (error) {
    console.warn(`[sponsor] guild record failed for ${agent}:`, error);
  }
}

/** Register the eight contract agents once per run. */
export async function registerAgents(): Promise<void> {
  try {
    await registerGuildAgents();
  } catch (error) {
    console.warn("[sponsor] guild agent registration failed:", error);
  }
}

/**
 * Produce student submissions onto the run's topic as live activity.
 *
 * This is the streaming layer earning its place: real work arriving as it
 * happens, which is what the "live data" half of the theme actually asks for.
 */
export async function ingestSubmissions(
  runId: string,
  submissions: Array<{ student_id: string; submission_id: string }>,
): Promise<number> {
  try {
    return await writeSubmissionActivities(runId, submissions);
  } catch (error) {
    console.warn(`[sponsor] laser ingest failed for ${runId}:`, error);
    return 0;
  }
}

export type PipelineOutcome<T> = {
  output: T | null;
  token: string | null;
  provider: string;
};

/**
 * Execute a RocketRide pipeline.
 *
 * Returns `output: null` when the pipeline is unavailable so callers can fall
 * back to their deterministic result rather than surfacing an error. The token
 * is kept either way — it is what proves in the audit trail that a real
 * pipeline ran.
 */
export async function runPipeline<T = unknown>(
  runId: string,
  task: PipelineTask,
  prompt: string,
  context?: Record<string, unknown>,
): Promise<PipelineOutcome<T>> {
  try {
    const result = await executePipeline<T>({ task, prompt, context });
    await trace({
      run_id: runId,
      actor: "system",
      action: `rocketride.pipeline:${task}`,
      details: { token: result.token, provider: result.provider },
    });
    return {
      output: result.output,
      token: result.token,
      provider: result.provider,
    };
  } catch (error) {
    console.warn(`[sponsor] rocketride "${task}" failed:`, error);
    await trace({
      run_id: runId,
      actor: "system",
      action: `rocketride.pipeline_failed:${task}`,
      details: { error: String(error) },
    });
    return { output: null, token: null, provider: "unavailable" };
  }
}

/** Test helper: forget what has been published so a rerun republishes. */
export function resetStreamProgress(runId?: string): void {
  resetDataPlaneProgress(runId);
}
