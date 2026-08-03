/**
 * Live RocketRide adapter — the motion layer, backed by real .pipe pipelines.
 *
 * Each PipelineTask maps to one pipeline on the RocketRide server. A task is
 * started once with `use()` and its token cached, then every request streams
 * its prompt through `send()` on that running pipeline. Reusing the token is
 * what keeps per-call latency down: borrowing a pipeline from the pool is the
 * expensive part, not the send.
 *
 * Pipelines return their payload through `result_types`, a map of field name
 * to data type. We pull the first text-ish field, parse it as JSON, and hand
 * it to the caller's Zod schema — so a malformed model response fails here
 * rather than three layers downstream.
 */
// Lazy-loaded: see laserStream.ts.
import type { RocketRideClient } from "rocketride";
import type { z } from "zod";
import { getEnvConfig } from "@/server/config";
import type {
  AdapterInfo,
  PipelineRequest,
  PipelineResult,
  PipelineTask,
  RocketRidePipelineAdapter,
} from "./types";

/** Pipeline names as they exist on the RocketRide server. */
const PIPELINE_NAMES: Record<PipelineTask, string> = {
  concept_extraction: "atrium/concept-extraction.pipe",
  variant_generation: "atrium/variant-generation.pipe",
  misconception_explanation: "atrium/misconception-explanation.pipe",
  lesson_plan_synthesis: "atrium/lesson-plan-synthesis.pipe",
};

type GlobalWithRocketRide = typeof globalThis & {
  __atrium_rocketride_live__?: Promise<RocketRideClient>;
  __atrium_rocketride_tokens__?: Map<PipelineTask, Promise<string>>;
};

function connect(): Promise<RocketRideClient> {
  const store = globalThis as GlobalWithRocketRide;
  if (!store.__atrium_rocketride_live__) {
    const config = getEnvConfig();
    if (!config.rocketrideApiKey) {
      return Promise.reject(new Error("ROCKETRIDE_APIKEY is required for live mode"));
    }
    const apiKey = config.rocketrideApiKey;
    store.__atrium_rocketride_live__ = import("rocketride")
      .then(async (mod) => {
        const client = new mod.RocketRideClient({
          auth: apiKey,
          uri: config.rocketrideUri,
          persist: true,
        });
        await client.connect();
        return client;
      })
      .catch((error: unknown) => {
        delete store.__atrium_rocketride_live__;
        throw error;
      });
  }
  return store.__atrium_rocketride_live__;
}

function tokenCache(): Map<PipelineTask, Promise<string>> {
  const store = globalThis as GlobalWithRocketRide;
  store.__atrium_rocketride_tokens__ ??= new Map();
  return store.__atrium_rocketride_tokens__;
}

/** Starts the task's pipeline once and reuses its token for later sends. */
function tokenFor(task: PipelineTask): Promise<string> {
  const cache = tokenCache();
  const existing = cache.get(task);
  if (existing) return existing;

  const pending = (async () => {
    const client = await connect();
    const started = await client.use({
      filepath: PIPELINE_NAMES[task],
      useExisting: true,
      name: `atrium:${task}`,
    });
    return started.token;
  })().catch((error: unknown) => {
    cache.delete(task);
    throw error;
  });

  cache.set(task, pending);
  return pending;
}

type PipelineResponse = {
  result_types?: Record<string, string>;
} & Record<string, unknown>;

/**
 * Pulls the pipeline's payload out of the dynamic result fields.
 *
 * `result_types` names which response fields hold data and what kind. Text and
 * answer fields arrive as string arrays, so segments are joined before parsing.
 */
function extractOutput(response: PipelineResponse | undefined, task: PipelineTask): unknown {
  if (!response) {
    throw new Error(`RocketRide pipeline "${task}" returned no result`);
  }

  const resultTypes = response.result_types ?? {};
  const preferred = Object.entries(resultTypes).find(([, type]) =>
    ["text", "answers", "json", "object"].includes(type),
  );
  const field = preferred?.[0] ?? Object.keys(resultTypes)[0];
  if (!field) {
    throw new Error(`RocketRide pipeline "${task}" returned no result_types`);
  }

  const value = response[field];
  const raw = Array.isArray(value) ? value.join("") : value;

  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string") {
    throw new Error(`RocketRide pipeline "${task}" field "${field}" was not text`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `RocketRide pipeline "${task}" returned non-JSON output: ${raw.slice(0, 200)}`,
    );
  }
}

export function createLiveRocketRideAdapter(): RocketRidePipelineAdapter {
  return {
    info(): AdapterInfo {
      return { name: "rocketride", mode: "live", provider: "rocketride-pipe" };
    },

    async run<T = unknown>(
      request: PipelineRequest,
      schema?: z.ZodType<T>,
    ): Promise<PipelineResult<T>> {
      const client = await connect();
      const token = await tokenFor(request.task);

      // An attachment (assignment PDF/image) routes through the pipeline's
      // OCR/NER nodes; otherwise the prompt itself is the payload.
      const payload = request.attachment?.data ?? request.prompt;
      const mimeType = request.attachment?.mimeType ?? "text/plain";
      // `mock_output` is reserved for the deterministic adapter. Never send a
      // complete fixture to the live provider as metadata.
      const liveContext = { ...(request.context ?? {}) };
      delete liveContext.mock_output;
      const objinfo: Record<string, unknown> = {
        task: request.task,
        ...(request.attachment ? { name: request.attachment.name } : {}),
        ...liveContext,
      };

      const response = (await client.send(
        token,
        payload,
        objinfo,
        mimeType,
      )) as PipelineResponse | undefined;

      const raw = extractOutput(response, request.task);

      return {
        task: request.task,
        provider: "rocketride",
        deterministic: false,
        token,
        output: schema ? schema.parse(raw) : (raw as T),
      };
    },

    async listPipelines(): Promise<string[]> {
      return Object.values(PIPELINE_NAMES).sort();
    },

    /**
     * No-op in live mode. The interface carries it so agent and test code can
     * hold one adapter type; overriding a real pipeline's output would make
     * "live" a lie.
     */
    setMockResponse(): void {},
  };
}

/** Disconnects the pooled client. Used by tests and by resetAdapters(). */
export async function closeLiveRocketRide(): Promise<void> {
  const store = globalThis as GlobalWithRocketRide;
  const pending = store.__atrium_rocketride_live__;
  delete store.__atrium_rocketride_live__;
  delete store.__atrium_rocketride_tokens__;
  if (!pending) return;
  try {
    const client = await pending;
    await client.disconnect();
  } catch {
    // A client that never connected needs no disconnecting.
  }
}
