# Lane brief — `lane/memory-graph`

**Goal:** Render the FalkorDB knowledge graph into the isometric world as a
floating constellation above the Memory building. FalkorDB is a mandated
sponsor whose use judges will specifically check, and right now **nothing on
screen shows a graph at all**.

Spec: [`docs/superpowers/specs/2026-08-02-atrium-ui-graph-design.md`](docs/superpowers/specs/2026-08-02-atrium-ui-graph-design.md) §3, §4, §5.

---

## You own these files

```
src/world/graph.ts                       NEW — deterministic radial layout
src/world/types.ts                       add GraphOverlay state
src/world/render.ts                      constellation draw only
src/app/api/runs/[runId]/graph/route.ts  NEW
src/components/panels/GraphDetail.tsx    NEW — node inspector
src/world/graph.test.ts                  NEW
```

## Do NOT touch

```
src/app/globals.css      ← lane/ui-schematic owns it
src/app/fonts.css        ← lane/ui-schematic owns it
src/world/layout.ts      ← lane/ui-schematic owns it
src/server/adapters/**   the adapter surface you need already exists
src/contracts/**         frozen
```

`src/world/render.ts` is shared. **`lane/ui-schematic` lands first — you
rebase onto it.** Keep your `render.ts` changes confined to the constellation
draw so the rebase is mechanical.

---

## Work

### 1. The API route

`GET /api/runs/:runId/graph`

Call the adapter — **do not add adapter surface, it already exists and is
tested**:

```ts
const { falkordb } = getAdapters();
await falkordb.neighborhood(nodeId, 2);          // → { nodes, edges }
await falkordb.findSharedBarriers(concepts);     // → SharedBarrierGroup[]
```

Both return render-ready shapes typed in `src/server/adapters/types.ts`.
Follow the existing route pattern in `src/app/api/runs/[runId]/route.ts`.

### 2. Deterministic layout — `src/world/graph.ts`

Positions come from a **radial layout seeded by node id**. No randomness, no
physics settling, no animation-frame convergence.

This is non-negotiable for two reasons: the demo must look identical every
run, and the layout has to be unit-testable. A force simulation gives you
neither.

Three rings, concept at the top of the iso stack:

```
Concept        ◇  large ring        outermost / highest
                ╱ ╲       BLOCKS (cyan)
Misconception  ◆   ◆  diamond       middle
                ╱ ╲      EXHIBITED (amber)
Student        ●   ●  filled dot    innermost / lowest
```

### 3. Draw it — `render.ts`

Constellation floats above the Memory building in iso space. Add a toggle so
it can be hidden — it must never occlude the school.

Marks: `Student` filled dot · `Misconception` diamond · `Concept` ring.
Edges: `EXHIBITED` amber, `BLOCKS` cyan.

### 4. Interaction — `GraphDetail.tsx`

Click a node → the existing `DetailPanel` shows the underlying record **plus
the Cypher that produced it**. Follow the pattern in
`src/components/panels/StudentDetail.tsx`.

Showing the Cypher matters: it is what proves to a judge that grouping is a
real traversal and not a prompt.

### 5. The demo moment

When grouping runs, the two-hop path illuminates edge by edge.

Maya and Devan both fail `integer_operations`. Their `EXHIBITED` edges must
visibly terminate at **different diamonds** — Maya at `sign_error_negatives`,
Devan at `operation_order_confusion`.

That single frame is the entire pitch. Build toward it.

---

## Done when

- [ ] `GET /api/runs/:runId/graph` returns nodes and edges from the adapter
- [ ] Constellation renders above the Memory building, toggleable
- [ ] Same run → identical node positions, every time
- [ ] Clicking a node opens a detail panel showing the record and its Cypher
- [ ] Two students failing one concept for different reasons are visibly
      connected to different misconception nodes
- [ ] `src/world/graph.test.ts` covers layout determinism and mark mapping
- [ ] `npm run lint && npm run typecheck && npm test && npm run verify:world`

## Verify

```bash
npm run lint && npm run typecheck && npm test && npm run verify:world
npm run dev   # http://localhost:3001 — press Enter to drive the loop
curl -s localhost:3001/api/runs/<runId>/graph | head -c 400
```

Baseline on this branch: 90/90 tests, lint and typecheck clean. Your new
`graph.test.ts` should push that number up.

---

## Prompt

Paste this to start:

> Read `BRIEF.md` and `docs/superpowers/specs/2026-08-02-atrium-ui-graph-design.md` (§3), then implement the in-world memory graph on this branch.
>
> Start with `src/world/graph.ts` and its test, before any rendering. The layout must be a radial layout seeded by node id — deterministic, no physics, no randomness — so the demo is identical every run and the layout is unit-testable. Write `src/world/graph.test.ts` alongside it.
>
> Then add `GET /api/runs/:runId/graph` following the pattern in `src/app/api/runs/[runId]/route.ts`. Call `getAdapters().falkordb.neighborhood()` and `findSharedBarriers()` — that adapter surface already exists and is tested, so do not add to it.
>
> Then draw the constellation in `src/world/render.ts` above the Memory building, toggleable so it never occludes the school: students as filled dots, misconceptions as diamonds, concepts as rings, EXHIBITED edges amber and BLOCKS edges cyan. Finally add `src/components/panels/GraphDetail.tsx` so clicking a node shows the record plus the Cypher that produced it, following `StudentDetail.tsx`.
>
> The frame to build toward: Maya and Devan both fail `integer_operations`, and their edges visibly terminate at different misconception diamonds. That is the whole pitch on screen.
>
> Constraints: touch only the files listed in the brief. `src/world/render.ts` is shared with `lane/ui-schematic`, which lands first — keep your diff there confined to the constellation draw so the rebase is mechanical.
>
> Verify with `npm run lint && npm run typecheck && npm test && npm run verify:world`, then run `npm run dev` on port 3001, drive a run, and screenshot the constellation. Baseline is 90/90 tests — your new tests should raise it.
