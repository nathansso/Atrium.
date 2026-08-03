# Integration and Merge Protocol

> Architecture update: the old adapter seam is now internal infrastructure.
> Application changes must use the RocketRide data plane for FalkorDB/LaserData
> and the Guild control plane for agents, approvals, and traces. See
> [ARCHITECTURE.md](ARCHITECTURE.md) before creating a new integration lane.

## Merge Order

1. `person-d/backend-infra-integrations`
2. `person-b/backend-core-loop`
3. `person-c/backend-assessment-evolution`
4. `person-a/frontend-world`
5. `integration/demo-polish`

Reason:

- Infra/event bus first gives backend branches shared plumbing.
- Core loop creates runs and rooms.
- Assessment extends run lifecycle.
- Frontend connects to the final API surface last.

## Pre-Merge Checklist

Each branch owner must run:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Each branch owner must update their doc:

- What was completed.
- What was intentionally mocked.
- Known risks.
- How to demo their branch.

## Conflict Policy

If two branches modify the same file:

1. Preserve shared contract names exactly.
2. Prefer typed adapters over direct imports.
3. Preserve deterministic demo behavior over realism.
4. If unsure, keep both implementations behind a single interface and decide in `integration/demo-polish`.

## Integration Branch Commands

```bash
git checkout main
git pull origin main
git checkout -b integration/demo-polish

git merge origin/person-d/backend-infra-integrations
git merge origin/person-b/backend-core-loop
git merge origin/person-c/backend-assessment-evolution
git merge origin/person-a/frontend-world
```

Then fix conflicts, run checks, and push:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
git push -u origin integration/demo-polish
```

## Final QA

Required checks:

- Start local dev server.
- Open app.
- Click Start Run.
- Watch rooms form.
- Click Ember and verify evidence.
- Toggle assignment variants.
- Click Run Classroom Simulation.
- Verify students move.
- Verify review queue has one low-confidence grade.
- Verify lesson plan appears.
- Refresh page and confirm run state can be reloaded or demo reset works.

## Demo Script

Opening:

> Teachers teach one classroom, but inside that classroom are many different learning histories. Most education software records performance after students fail. Atrium changes what students receive before they fail.

During room construction:

> These rooms are not based on labels or diagnoses. They are based on the barrier each student is facing right now.

During assignment comparison:

> The learning objective stays the same. The pathway changes.

Closing:

> Every assignment teaches the student. Every submission rebuilds the school.

## Emergency Fallback

If sponsor APIs are slow or unavailable:

- Keep `SPONSOR_MODE=mock`.
- Show adapter code and event logs.
- Emphasize identical contracts for real integrations.
- Run the polished deterministic demo.

If Phaser integration breaks:

- Use React-rendered isometric SVG/CSS tiles as fallback.
- Keep event-to-animation mapping.
- Preserve the living-school metaphor.

If model calls fail:

- Use cached deterministic model outputs.
- Show structured payloads.
- Avoid live network dependency during judging.
