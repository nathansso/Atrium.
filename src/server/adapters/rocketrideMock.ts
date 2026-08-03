/**
 * Mock RocketRide adapter: deterministic canned pipeline outputs so the demo
 * runs offline. Fixtures ported unchanged from the previous model adapter —
 * task names are identical, so agent code did not move during the sponsor
 * swap.
 *
 * Lanes override any task's output with seed-derived fixtures via
 * setMockResponse().
 */
import type { z } from "zod";
import type {
  AdapterInfo,
  PipelineRequest,
  PipelineResult,
  PipelineTask,
  RocketRidePipelineAdapter,
} from "./types";

const DEFAULT_FIXTURES: Record<PipelineTask, unknown> = {
  concept_extraction: {
    concepts: [
      { concept_id: "integer_operations", label: "Integer Operations", emphasis: 0.35 },
      { concept_id: "distributive_property", label: "Distributive Property", emphasis: 0.3 },
      { concept_id: "equation_sequencing", label: "Equation Sequencing", emphasis: 0.2 },
      { concept_id: "combining_like_terms", label: "Combining Like Terms", emphasis: 0.15 },
    ],
  },
  variant_generation: {
    adaptation_summary:
      "Same objectives, adjusted pathway: worked example first, then scaffolded practice, then independent items.",
    objective_preserved: true,
    rigor_preserved: true,
  },
  misconception_explanation: {
    misconception_id: "sign_error_negatives",
    explanation:
      "The student treats subtraction of a negative as subtraction of a positive, dropping the sign flip.",
    recommended_intervention: "Number-line warm-up contrasting -(-3) and -(+3) before re-attempting.",
  },
  lesson_plan_synthesis: {
    whole_class_intervention: "Ten-minute distribution mini-lesson with a shared error-analysis example.",
    room_rotations: {
      ember: "Quick check on integer sign fluency.",
      forge: "Targeted box-model distribution practice.",
      harbor: "Sequencing transfer task with step cards.",
      summit: "Extension: justify each transformation in writing.",
    },
  },
};

/** Pipeline names as they exist on the RocketRide server. */
const PIPELINE_NAMES: Record<PipelineTask, string> = {
  concept_extraction: "atrium/concept-extraction.pipe",
  variant_generation: "atrium/variant-generation.pipe",
  misconception_explanation: "atrium/misconception-explanation.pipe",
  lesson_plan_synthesis: "atrium/lesson-plan-synthesis.pipe",
};

type RocketRideState = {
  overrides: Partial<Record<PipelineTask, unknown>>;
  tokenCounter: number;
};

const GLOBAL_KEY = "__atrium_rocketride_mock__";

function getState(): RocketRideState {
  const store = globalThis as Record<string, unknown>;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = { overrides: {}, tokenCounter: 0 } satisfies RocketRideState;
  }
  return store[GLOBAL_KEY] as RocketRideState;
}

export function createMockRocketRideAdapter(): RocketRidePipelineAdapter {
  return {
    info(): AdapterInfo {
      return { name: "rocketride", mode: "mock", provider: "deterministic-fixtures" };
    },

    async run<T = unknown>(request: PipelineRequest, schema?: z.ZodType<T>): Promise<PipelineResult<T>> {
      const state = getState();
      state.tokenCounter += 1;
      const contextualOutput = request.context?.mock_output;
      const raw =
        state.overrides[request.task] ??
        contextualOutput ??
        DEFAULT_FIXTURES[request.task];
      const output = schema ? schema.parse(raw) : (raw as T);
      return {
        task: request.task,
        provider: "mock",
        deterministic: true,
        // Shaped like a real RocketRide task token so the audit trail matches.
        token: `mock_${String(state.tokenCounter).padStart(4, "0")}`,
        output,
      };
    },

    async listPipelines(): Promise<string[]> {
      return Object.values(PIPELINE_NAMES).sort();
    },

    setMockResponse(task: PipelineTask, output: unknown): void {
      getState().overrides[task] = output;
    },
  };
}

/** Test/demo-reset helper. */
export function resetMockRocketRide(): void {
  const store = globalThis as Record<string, unknown>;
  delete store[GLOBAL_KEY];
}
