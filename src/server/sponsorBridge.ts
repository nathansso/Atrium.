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
import type { AgentEvent, AgentName, AgentResult, RunState } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import type { PipelineTask } from "@/server/adapters";
import { recordAudit } from "@/server/audit";

/** Per-run high-water mark of events already published to the stream. */
const PUBLISHED_KEY = "__atrium_laser_published__";

function publishedCounts(): Map<string, number> {
  const store = globalThis as Record<string, unknown>;
  if (!store[PUBLISHED_KEY]) {
    store[PUBLISHED_KEY] = new Map<string, number>();
  }
  return store[PUBLISHED_KEY] as Map<string, number>;
}

/**
 * Publish every event appended since the last call onto the run's topic.
 *
 * Idempotent by high-water mark, so calling it after each stage never
 * double-publishes. Laser delivery is at-least-once regardless, which is why
 * consumers must stay idempotent.
 */
export async function drainEventsToStream(state: RunState): Promise<number> {
  const { laser } = getAdapters();
  const counts = publishedCounts();
  const alreadySent = counts.get(state.run_id) ?? 0;
  const pending = state.events.slice(alreadySent);
  if (pending.length === 0) {
    return 0;
  }

  try {
    await laser.ensureTopic(state.run_id);
    for (const event of pending) {
      await laser.publish(event as AgentEvent);
    }
    counts.set(state.run_id, state.events.length);
    return pending.length;
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
  const { guild } = getAdapters();
  try {
    await guild.recordAgentRun({
      run_id: runId,
      agent,
      status: result.status,
      confidence: result.confidence,
      evidence_refs: result.evidence_refs.slice(0, 8),
      human_review_required: result.human_review_required,
    });
  } catch (error) {
    console.warn(`[sponsor] guild record failed for ${agent}:`, error);
  }
}

/** Register the eight contract agents once per run. */
export async function registerAgents(): Promise<void> {
  const { guild } = getAdapters();
  try {
    await guild.registerDefaultAgents();
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
  const { laser } = getAdapters();
  try {
    await laser.ensureTopic(runId);
    for (const submission of submissions) {
      await laser.ingestActivity({
        run_id: runId,
        student_id: submission.student_id,
        kind: "submission",
        payload: { submission_id: submission.submission_id },
        observed_at: new Date().toISOString(),
      });
    }
    return submissions.length;
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
  const { rocketride } = getAdapters();
  try {
    const result = await rocketride.run<T>({ task, prompt, context });
    // The token is the receipt. Auditing every execution is what lets anyone
    // verify the pipeline actually ran rather than taking the output on faith.
    recordAudit({
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
    recordAudit({
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
  const counts = publishedCounts();
  if (runId) {
    counts.delete(runId);
  } else {
    counts.clear();
  }
}
