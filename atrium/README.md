# Atrium — RocketRide `.pipe` definitions

These are the four RocketRide (Aparavi) pipeline definitions that back Atrium's
**motion layer**. Each file is a `PipelineConfig` wrapped as `{ "pipeline": { … } }`
— the format `RocketRideClient.use({ filepath })` reads and auto-unwraps
(`node_modules/rocketride/dist/cjs/client.js` → *".pipe files wrap the config in
`{ "pipeline": { … } }` — unwrap if present"*).

## The four pipelines

| File | `PipelineTask` | Consumed by | Returns (JSON) |
|---|---|---|---|
| `concept-extraction.pipe` | `concept_extraction` | Assignment Architect | `concepts[]`, `objectives[]`, `difficulty`, `constraints[]` |
| `variant-generation.pipe` | `variant_generation` | Assignment Curator | `objective_preserved`, `rigor_preserved`, `variant`, `adaptation_summary`, `rationale` |
| `misconception-explanation.pipe` | `misconception_explanation` | Assessment | `misconception_id`, `concept_id`, `explanation`, `confidence`, `evidence[]` |
| `lesson-plan-synthesis.pipe` | `lesson_plan_synthesis` | Lesson Planner | `whole_class_intervention`, `timeline[]` |

## How the app uses them

`src/server/adapters/rocketrideLive.ts` maps each task to `atrium/<task>.pipe`
and starts it with:

```ts
client.use({ filepath: "atrium/concept-extraction.pipe", useExisting: true, name: "atrium:concept_extraction" });
```

`useExisting: true` reuses the pipeline if it is already deployed on the
RocketRide server, and otherwise **deploys it from this file**. The pipeline's
`response` node exposes `result_types: { "text": "text" }`; the adapter pulls that
`text` field and `JSON.parse`s it, then validates it against the consuming
agent's Zod schema — so a malformed model response fails at the boundary.

## Node graph

`webhook (input)` → *(concept-extraction only:* `ocr` → `ner` *)* → `ai_chat (llm)` → `response (output)`,
connected by data lanes (`{ lane, from }`). `source` is the `input` component.

## Configuration

The `ai_chat` nodes use `${ROCKETRIDE_*}` substitution, filled from the client's
`env`/`.env` at `use()` time:

```bash
ROCKETRIDE_APIKEY=...            # required for live mode
ROCKETRIDE_URI=https://api.rocketride.ai
ROCKETRIDE_LLM_PROVIDER=...      # e.g. an LLM provider node id
ROCKETRIDE_LLM_MODEL=...         # model name for that provider
```

## Deploy / validate

Before a live run, validate each definition against your RocketRide node
catalog (provider node ids such as `ocr`, `ner`, `ai_chat`, `response` and their
config keys must match your deployment):

```ts
await client.validate({ pipeline: require("./atrium/concept-extraction.pipe").pipeline });
```

This closes blocker #1 of issue #2 ("the four `.pipe` files do not exist"): the
definitions now live in the repo and can be analysed and deployed. The two
remaining adapter fixes from that issue — a send timeout and token-cache
invalidation — are tracked separately.
