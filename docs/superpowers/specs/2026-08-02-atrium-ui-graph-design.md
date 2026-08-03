# Atrium — Schematic UI + In-World Memory Graph

**Date:** 2026-08-02
**Status:** Approved
**Context:** Memory Meets Motion hackathon, Frontier Tower SF, 2026-08-03

---

## Problem

Two things are wrong with the current UI.

1. **It is recognizably a previous project.** The interface quotes Minecraft —
   voxel cubes, `PressStart2P`, torch-gold on night-blue, 3px bevels. Anyone
   who saw the earlier build recognizes it immediately.
2. **FalkorDB is invisible.** The knowledge graph is the intellectual core of
   Atrium and a mandated sponsor whose use judges will check. Nothing on
   screen currently shows a graph.

The isometric world itself is an asset, not a liability — no other team will
ship one. The fix is to change the visual *language* the world is quoting,
not to replace the world.

## Goals

- Atrium does not read as the earlier project at a glance
- The FalkorDB graph is visible, interactive, and obviously load-bearing
- No new downloaded assets — the demo must render identically offline
- Ship-ready the morning of 2026-08-03

## Non-goals

- Rewriting the isometric renderer
- Changing the domain loop, agents, contracts, or API surface
- Changing layout or information architecture

---

## Design

### §1 Visual language — factory schematic

Direction: Zachtronics / Factorio / shapez. Those games *are* node graphs and
conveyor motion, which is the hackathon theme stated visually.

**`PressStart2P` is the single strongest recognition signal** — stronger than
the palette. Removing it changes the read instantly at zero asset cost.

| Token | Current | New |
|---|---|---|
| `--void` | `#0b0d14` night-blue | `#12171d` cool slate |
| `--stone` | `#26262f` | `#1c2128` |
| `--stone-raised` | `#2f2f3a` | `#262d36` |
| `--stone-hi` | `#4d4d5e` | `#3a4551` hairline |
| `--gold` | `#ffc64d` torch | `#f0a848` industrial amber |
| `--aqua` | `#6fd2ff` | `#4dd0e1` signal cyan |
| `--text` | `#e8e8f0` | `#d8dee6` |
| `--text-dim` | `#a0a0b4` | `#8896a4` |
| `--font-display` | `PressStart2P` | `--font-mono` (system stack) |
| `--font-label` | `Silkscreen` everywhere | `Silkscreen` on world labels only |
| `--bevel` | `3px` | `0` — replaced by 1px hairlines |

Chrome rules:

- 1px hairline borders; corner bracket ticks instead of bevels
- Flat fills, no raised-stone gradients
- Diagonal hatching for inactive/disabled states
- Uppercase labels with `letter-spacing: 0.08em`

Room accent colors (`--room-ember`, `--room-forge`, `--room-harbor`,
`--room-summit`) keep their hues so room identity survives, but drop
saturation ~15% to sit inside the schematic palette.

### §2 World renderer — buildings become machines

`src/world/layout.ts` building ramps and `src/world/render.ts` face drawing.

- Flat desaturated face fills, hairline stroke on every face edge
- Ground plane: diagonal hatch replaces the checkerboard
- Window dots become instrument tick marks
- **Conveyor edges between buildings that illuminate when events flow**

The conveyor edges are the highest-value item in this section: they read as
"not the old project" from across a room, and they make the LaserData event
stream visible as motion.

### §3 In-world memory graph

Renders into the isometric scene, floating above the Memory building.

**Node and edge vocabulary**

| Element | Mark |
|---|---|
| `Student` | small filled dot |
| `Misconception` | diamond |
| `Concept` | large ring |
| `EXHIBITED` | student → misconception, amber |
| `BLOCKS` | misconception → concept, cyan |

**Data flow**

```
GET /api/runs/:runId/graph
  → getAdapters().falkordb.neighborhood() / findSharedBarriers()
  → { nodes, edges }                        (already typed in adapters/types.ts)
  → src/world/graph.ts  radial layout → iso positions
  → render.ts draws into the existing scene
```

Both adapter methods already exist and are covered by tests. This section
adds no new adapter surface.

**Interaction**

- Click a node → existing `DetailPanel` shows the underlying record **plus
  the Cypher that produced it**
- When grouping runs, the two-hop path illuminates edge by edge

**The demo moment.** Maya and Devan both fail `integer_operations`. On screen
their `EXHIBITED` edges visibly terminate at *different* diamonds — Maya at
`sign_error_negatives`, Devan at `operation_order_confusion`. That is the
entire pitch, rendered.

**Layout must be deterministic.** `graph.ts` computes positions from a radial
layout seeded by node id — no randomness, no physics settling — so the demo
looks identical every run and the layout is unit-testable.

### §4 Files

**§1 + §2 (visual)**
- `src/app/globals.css` — token block, chrome rules
- `src/app/fonts.css` — remove the `PressStart2P` face
- `src/world/layout.ts` — building ramps
- `src/world/render.ts` — stroke/hatch treatment, conveyor edges

**§3 (graph)**
- `src/world/graph.ts` — *new*, deterministic radial layout
- `src/world/types.ts` — `GraphOverlay` state
- `src/world/render.ts` — constellation draw
- `src/app/api/runs/[runId]/graph/route.ts` — *new*
- `src/components/panels/GraphDetail.tsx` — *new*, node inspector

`render.ts` is touched by both workstreams. It is the one collision point;
whoever lands second rebases.

### §5 Testing

- `src/world/graph.test.ts` — *new*. Deterministic layout: same input → same
  positions; node kinds map to the right marks; two-hop paths resolve
- Existing `src/world/sim.test.ts` and `scripts/verify-world.mjs` continue to
  smoke the renderer
- No adapter or contract tests change — this work adds no domain surface

---

## Cut line

Ordered by value, so work can stop at any point and still ship:

1. **§1 tokens + typography** — ~80% of the recognition fix, ~1 hour, near-zero risk
2. **§3 graph constellation** — the FalkorDB showcase judging requires
3. **§2 renderer schematic pass** — highest polish, highest risk. If time runs
   short, keep the conveyor edges and drop the hatching

## Risks

| Risk | Mitigation |
|---|---|
| Renderer changes break the world | `verify-world.mjs` runs on every change |
| Graph occludes the school | Constellation renders above the Memory building only, with a toggle |
| Two branches both edit `render.ts` | Land §1+§2 first; §3 rebases |
| Schematic palette hurts room legibility | Room hues preserved, saturation reduced not removed |
