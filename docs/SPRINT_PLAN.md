# Atrium — Memory Meets Motion Sprint Plan

**Event:** Memory Meets Motion · Frontier Tower, San Francisco · August 3, 2026
**Format:** 8-hour build sprint
**Team:** 4 people, one sponsor lane each

---

## 0. What we are building

Atrium is a self-evolving classroom. A professor uploads one assignment; the
system reads previous student performance, works out *why* each student is
stuck, forms temporary learning rooms around shared barriers, adapts the
assignment per room without lowering rigor, grades the results, updates each
student's mastery, and produces a next-day teaching plan. The whole loop is
rendered as a living pixel school that visibly rebuilds itself.

This maps directly onto the problem statement's own suggested project,
**AI Study Companion**, with all four mandated technologies load-bearing.

---

## 1. Sponsor roles — non-overlapping by design

Every project must integrate all four sponsors *meaningfully*. Judges will
check. The trap: **the Laser SDK also ships a knowledge graph, a KV store and
a full agent runtime.** If we use those, FalkorDB and Guild.ai become
decorative imports and we fail the explicit judging criterion.

So each sponsor owns exactly one job, and we use only Laser's streaming layer.

| Layer | Sponsor | Its job | Why it is load-bearing |
|---|---|---|---|
| **Memory** | FalkorDB | Classroom knowledge graph | Multi-hop Cypher *performs* room formation. Remove it and grouping stops working |
| **Live** | LaserData | Iggy topic per run | Every submission and agent event flows through it; UI replay reads real offsets |
| **Motion** | RocketRide | `.pipe` pipelines | Concept extraction, variant generation, lesson-plan synthesis. Remove it and nothing is generated |
| **Agents** | Guild.ai | 8 specialist agents | Handoffs and human approval gates. Remove it and the loop has no coordination or human gate |

### The query that justifies FalkorDB

Two students both fail `integer_operations`. A flat vector search says
"group them." The graph says otherwise:

```cypher
MATCH (s:Student)-[:EXHIBITED]->(m:Misconception)-[:BLOCKS]->(c:Concept)
WHERE c.id IN $concepts
WITH m, c, collect(s.id) AS students
WHERE size(students) >= $minGroupSize
RETURN m.id, c.id, students
```

Student A has a *sign-error* barrier; Student B has an *order-of-operations*
barrier. Different rooms, different adaptations. That two-hop path
`Student → Misconception → Concept` is the whole argument for a graph
database, and it is the thing to show a judge.

---

## 2. Pre-sprint checklist — do this TONIGHT

8 hours goes fast. Nobody should be creating accounts at hour 0.

**Everyone:**
- [ ] `git clone` the repo, `npm install`, confirm `npm run dev` boots on **port 3001**
- [ ] Docker Desktop running (Engine 25+; we have 29.6)
- [ ] Node 22.14+ (we have 25.8) — required by the Laser SDK

**Per lane owner:**
- [ ] **FalkorDB** — `docker run -p 6379:6379 -p 3002:3000 falkordb/falkordb:latest`, confirm connection
- [ ] **LaserData** — clone [laser-stack](https://github.com/laserdata/laser-stack), `./scripts/up`, copy the printed connection string. Or the [cloud free tier](https://laserdata.cloud/?source=sf-memory-motion-hackthon-2026)
- [ ] **RocketRide** — create account, generate API key at `api.rocketride.ai`. **This is the only sponsor with no local fallback — if this key does not exist, the motion lane is blocked**
- [ ] **Guild.ai** — `npm i -g @guildai/cli && guild auth login`. Note: `@guildai/agents-sdk` 404s on public npm by design; the login configures a private registry
- [ ] Join the [LaserData Discord](https://discord.gg/QXVbqWxHHb) and the [RocketRide Discord](https://discord.gg/PMXrtenMsY) for sponsor support

### Port map — three services want 3000

| Service | Port |
|---|---|
| Next.js dev | **3001** (moved) |
| Iggy TCP (Laser) | 8090 |
| Iggy HTTP (Laser) | 3000 |
| FalkorDB Redis | 6379 |
| FalkorDB Browser UI | **3002** (remapped) |

---

## 3. The seam — already landed, do not renegotiate

`src/server/adapters/types.ts` defines all four interfaces. `src/server/config/env.ts`
defines modes and keys. **These are frozen at hour 0.** Every lane implements
its own interface behind `getAdapters()`; no lane imports another lane's
concrete implementation. This is what lets four people work in parallel
without merge conflicts.

`SPONSOR_MODE=mock` (the default) yields deterministic mocks for every
adapter. `SPONSOR_MODE=live` uses real services, and any adapter missing its
keys falls back to its mock with a warning rather than breaking the demo.
**Keep that property.** It is the reason a network failure at the venue does
not end the run.

---

## 4. Lanes

### Lane 1 — Memory (FalkorDB)

**Owns:** `src/server/adapters/falkorGraph.ts`, `falkorMock.ts`, graph seed script

- Implement `FalkorGraphAdapter` against `falkordb@6.7.0`
- `ensureSchema()` — indices on `Student.id`, `Concept.id`, `Misconception.id`
- Seed the synthetic Algebra I class into the graph
- Implement `findSharedBarriers()` — the multi-hop query above. This is the lane's single most important deliverable
- `neighborhood()` returns nodes/edges for the UI panel
- `masteryTrajectory()` — mastery over time, the "memory compounds" story

**Done when:** grouping is driven by a real Cypher traversal, and stopping the
FalkorDB container visibly breaks room formation.

### Lane 2 — Live (LaserData)

**Owns:** `src/server/adapters/laserStream.ts`, `laserMock.ts`, `src/server/events/*`

- Implement `LaserStreamAdapter` against `@laserdata/laser-sdk`
- One Iggy topic per run; `ensureTopic(runId, 4)`
- Replace the in-memory event bus behind the existing interface — the SSE route and UI must not change
- `replay(runId, fromOffset)` backs the UI scrubber with **real offsets**
- `ingestActivity()` — live submissions produced as they happen
- Idempotent handlers: delivery is at-least-once

**Watch out:** the SDK is ESM-only, `0.0.1`, published Aug 2 2026. Expect
rough edges. It needs `await using` / explicit `close()`.

**Done when:** the UI scrubber replays a completed run from offset 0 out of a
real Iggy topic.

### Lane 3 — Motion (RocketRide)

**Owns:** `src/server/adapters/rocketridePipeline.ts`, `rocketrideMock.ts`, `pipelines/*.pipe`

- Implement `RocketRidePipelineAdapter` against `rocketride@1.3.0`
- Build four `.pipe` pipelines: `concept_extraction`, `variant_generation`, `misconception_explanation`, `lesson_plan_synthesis`
- Use OCR/NER nodes for the assignment upload path — that is real "motion", not just an LLM call
- Lifecycle: `connect()` → `use({filepath})` → token → `send()` → `terminate()`
- Use `persist: true` and the `onConnectError` callback; the venue wifi will drop

**Note:** `modelMock.ts` holds the existing deterministic fixtures — port
them into `rocketrideMock.ts` rather than rewriting. Task names are unchanged
from the old `ModelTask`, so agent code does not move.

**Done when:** an uploaded assignment produces concepts through a real
pipeline run, with the token in the audit trail.

### Lane 4 — Agents (Guild.ai)

**Owns:** `src/server/adapters/guildAgents.ts`, `guildMock.ts`, `src/server/agents/*`

- Implement `GuildAgentAdapter` against `@guildai/agents-sdk`
- Define the eight agents with `llmAgent()` / auto-managed state
- `handoff()` — explicit, visible transfers between specialists
- `requestApproval()` — human-in-the-loop gates on low-confidence grades and the final plan. **This is Guild's headline feature; make it visible on screen**
- Mirror agent runs into the existing audit log

**Note:** `guildMock.ts` already implements most of this synchronously. The
interface is now async — convert, don't rewrite.

**Done when:** a low-confidence grade pauses the run and waits for a human
click before the plan is generated.

### Shared / floating work

Whoever clears their lane first:
- **Graph panel in the UI** — highest-value remaining item. Nothing on screen
  currently shows a graph, and FalkorDB is a mandated sponsor. Slots into the
  existing `DetailPanel` pattern
- Rename Atrium → Atrium across ~26 files
- README + architecture doc

---

## 5. Timeline

| Hour | Goal |
|---|---|
| 0 | Contracts frozen. Everyone confirms their sponsor connects. **Anyone blocked on a key says so now** |
| 1–2 | Each lane: mock passing tests, real client connecting |
| 3 | **Checkpoint 1** — every lane demos its sponsor doing one real call |
| 4–5 | Wire lanes together end to end: upload → concepts → graph → rooms → variants |
| 6 | **Checkpoint 2** — full loop runs in `SPONSOR_MODE=live`. Feature freeze after this |
| 7 | Graph panel, rename, README. Demo rehearsal ×2 |
| 8 | Submit |

**Fallback rule:** if a live adapter is not working by hour 6, ship it in mock
mode and say so honestly. A working demo with three live sponsors beats a
broken one with four.

---

## 6. Merge protocol

- Branch per lane: `lane/memory`, `lane/live`, `lane/motion`, `lane/agents`
- Never edit another lane's adapter file
- `types.ts` and `env.ts` changes require a group decision — they are the seam
- Merge to `main` at each checkpoint, not continuously
- `npm run lint && npm run typecheck && npm test` must pass before merging

---

## 7. Demo script (8 minutes)

1. **Cold open** — the pixel school, quiet. "This is one classroom, 20 students."
2. **Upload** an assignment → RocketRide pipeline extracts concepts live
3. **The graph** → FalkorDB panel: two students failing the same concept for
   *different* reasons. Run the Cypher live in the FalkorDB browser UI
4. **Rooms form** around barriers, not scores. Students visibly move
5. **Submissions stream in** → LaserData feeds them live; the world reacts
6. **A low-confidence grade** → Guild.ai pauses, asks a human. Judge clicks approve
7. **The school rebuilds** → mastery updates, rooms dissolve and re-form
8. **Scrub back** through the run from Laser offset 0 — durable memory, not a screenshot

Close on: *memory that compounds, motion that acts on it.*
