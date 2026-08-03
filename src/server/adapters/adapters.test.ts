import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Room } from "@/contracts";
import { resetEventBus } from "@/server/events";
import { getAdapterStatus, getAdapters, resetAdapters } from "./index";

const RUN = "run_adapters";

const emberRoom: Room = {
  room_id: "ember",
  name: "Ember",
  focus_concepts: ["integer_operations"],
  dominant_barrier: "repeated sign errors in integer operations",
  evidence_refs: ["obs_0001"],
  members: ["s1", "s2"],
  base_adaptation: "worked examples first",
  explanation: "Grouped by shared sign-error barrier.",
};

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPONSOR_MODE", "");
  await resetAdapters();
  resetEventBus();
});

describe("adapter factory", () => {
  it("exposes the four mandated sponsors plus the firecrawl research provider", () => {
    const adapters = getAdapters();
    expect(Object.keys(adapters).sort()).toEqual([
      "falkordb",
      "firecrawl",
      "guild",
      "laser",
      "rocketride",
    ]);
  });

  it("returns a stable singleton bundle", () => {
    expect(getAdapters()).toBe(getAdapters());
  });

  it("reports every adapter as mock by default", () => {
    const status = getAdapterStatus();
    expect(status).toHaveLength(5);
    expect(status.every((entry) => entry.effective_mode === "mock")).toBe(true);
  });

  it("selects the live implementation when the mode and keys are both present", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("FALKORDB_URL", "redis://127.0.0.1:6379");
    await resetAdapters();

    // info() is synchronous and opens no socket, so this asserts selection
    // without needing a server on the other end.
    expect(getAdapters().falkordb.info()).toMatchObject({
      mode: "live",
      provider: "falkordb-cypher",
    });
  });

  it("falls back to the mock per adapter when only some keys are present", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("FALKORDB_URL", "redis://127.0.0.1:6379");
    await resetAdapters();

    const adapters = getAdapters();
    // FalkorDB has its URL and goes live; Laser and RocketRide do not.
    expect(adapters.falkordb.info().mode).toBe("live");
    expect(adapters.laser.info().mode).toBe("mock");
    expect(adapters.rocketride.info().mode).toBe("mock");
  });

  it("falls back to mock when only one of guild's two gate credentials is present", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("GUILD_API_KEY", "gk_test");
    await resetAdapters();

    const guild = getAdapterStatus().find((entry) => entry.name === "guild");
    expect(guild).toMatchObject({ keys_present: false, effective_mode: "mock" });
    expect(getAdapters().guild.info().mode).toBe("mock");
  });

  it("selects the live guild adapter once both gate credentials and the workspace are present", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    vi.stubEnv("GUILD_API_KEY", "gk_assessment");
    vi.stubEnv("GUILD_LESSON_PLANNER_API_KEY", "gk_lesson_planner");
    vi.stubEnv("GUILD_WORKSPACE", "mem-in-motion/atrium");
    await resetAdapters();

    // info() is synchronous and opens no connection, so this asserts
    // selection without calling Guild's API.
    expect(getAdapters().guild.info()).toMatchObject({
      mode: "live",
      provider: "guild-trigger-api",
    });
    const guild = getAdapterStatus().find((entry) => entry.name === "guild");
    expect(guild).toMatchObject({ keys_present: true, effective_mode: "live" });
  });
});

describe("FalkorDB — memory layer", () => {
  it("groups students by shared barrier, not by shared concept", async () => {
    const { falkordb } = getAdapters();
    await falkordb.ensureSchema();

    // Maya and Priya drop signs. Devan fails the same concept for a
    // different reason, so he must not land in their room.
    await falkordb.recordMisconception({
      student_id: "maya",
      misconception_id: "sign_error_negatives",
      concept_id: "integer_operations",
      run_id: RUN,
      evidence_refs: ["sub_1"],
    });
    await falkordb.recordMisconception({
      student_id: "priya",
      misconception_id: "sign_error_negatives",
      concept_id: "integer_operations",
      run_id: RUN,
      evidence_refs: ["sub_2"],
    });
    await falkordb.recordMisconception({
      student_id: "devan",
      misconception_id: "operation_order_confusion",
      concept_id: "integer_operations",
      run_id: RUN,
      evidence_refs: ["sub_3"],
    });

    const groups = await falkordb.findSharedBarriers(["integer_operations"]);

    expect(groups).toHaveLength(1);
    expect(groups[0].misconception_id).toBe("sign_error_negatives");
    expect(groups[0].student_ids).toEqual(["maya", "priya"]);
    expect(groups[0].student_ids).not.toContain("devan");
  });

  it("explains each grouping with the graph path that produced it", async () => {
    const { falkordb } = getAdapters();
    for (const student of ["maya", "priya"]) {
      await falkordb.recordMisconception({
        student_id: student,
        misconception_id: "sign_error_negatives",
        concept_id: "integer_operations",
        run_id: RUN,
        evidence_refs: [],
      });
    }
    const [group] = await falkordb.findSharedBarriers(["integer_operations"]);
    expect(group.path_explanation).toContain("EXHIBITED");
    expect(group.path_explanation).toContain("BLOCKS");
  });

  it("ignores concepts outside the current assignment", async () => {
    const { falkordb } = getAdapters();
    await falkordb.recordMisconception({
      student_id: "maya",
      misconception_id: "sign_error_negatives",
      concept_id: "integer_operations",
      run_id: RUN,
      evidence_refs: [],
    });
    expect(await falkordb.findSharedBarriers(["combining_like_terms"])).toEqual([]);
  });

  it("accumulates mastery history so memory compounds across assignments", async () => {
    const { falkordb } = getAdapters();
    await falkordb.upsertMastery([
      {
        student_id: "maya",
        concept_id: "integer_operations",
        mastery: { score: 0.4, confidence: 0.5, trend: "flat" },
        updated_at: "2026-08-01T00:00:00.000Z",
      },
    ]);
    await falkordb.upsertMastery([
      {
        student_id: "maya",
        concept_id: "integer_operations",
        mastery: { score: 0.62, confidence: 0.7, trend: "rising" },
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    ]);

    const trajectory = await falkordb.masteryTrajectory("maya", "integer_operations");
    expect(trajectory).toHaveLength(2);
    expect(trajectory[0].mastery.score).toBeLessThan(trajectory[1].mastery.score);

    // getMastery returns only the newest estimate per concept.
    const current = await falkordb.getMastery("maya", "integer_operations");
    expect(current).toHaveLength(1);
    expect(current[0].mastery.score).toBeCloseTo(0.62);
    expect(current[0].mastery.trend).toBe("rising");
  });

  it("returns a node/edge slice for the graph panel", async () => {
    const { falkordb } = getAdapters();
    await falkordb.recordMisconception({
      student_id: "maya",
      misconception_id: "sign_error_negatives",
      concept_id: "integer_operations",
      run_id: RUN,
      evidence_refs: [],
    });

    const graph = await falkordb.neighborhood("maya", 2);
    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["Student", "Misconception", "Concept"]),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["EXHIBITED", "BLOCKS"]),
    );
  });

  it("persists room formations per run", async () => {
    const { falkordb } = getAdapters();
    expect(await falkordb.saveRoomFormation(RUN, [emberRoom])).toBe(1);
  });
});

describe("LaserData — live layer", () => {
  it("assigns monotonic offsets and replays from any offset", async () => {
    const { laser } = getAdapters();
    await laser.ensureTopic(RUN, 4);

    await laser.emit({
      event_type: "assignment.uploaded",
      run_id: RUN,
      source_agent: "assignment_architect",
      payload: {},
    });
    await laser.emit({
      event_type: "assignment.concepts.extracted",
      run_id: RUN,
      source_agent: "assignment_architect",
      payload: {},
    });

    const all = await laser.replay(RUN);
    expect(all.map((record) => record.offset)).toEqual([0n, 1n]);
    expect(await laser.latestOffset(RUN)).toBe(1n);

    // The UI scrubber reads from an offset, not a client-side array.
    const tail = await laser.replay(RUN, 1n);
    expect(tail).toHaveLength(1);
    expect(tail[0].event.event_type).toBe("assignment.concepts.extracted");
  });

  it("reports offset -1 for a run with no records", async () => {
    const { laser } = getAdapters();
    expect(await laser.latestOffset("run_empty")).toBe(-1n);
  });

  it("delivers published events to live subscribers", async () => {
    const { laser } = getAdapters();
    const seen: string[] = [];
    const unsubscribe = laser.subscribe(RUN, (event) => seen.push(event.event_type));

    await laser.emit({
      event_type: "groups.proposed",
      run_id: RUN,
      source_agent: "grouping_agent",
      payload: {},
    });
    unsubscribe();
    await laser.emit({
      event_type: "lesson.plan.ready",
      run_id: RUN,
      source_agent: "lesson_planner",
      payload: {},
    });

    expect(seen).toEqual(["groups.proposed"]);
  });

  it("replays from an offset before continuing a subscription", async () => {
    const { laser } = getAdapters();
    await laser.emit({
      event_type: "assignment.uploaded",
      run_id: RUN,
      source_agent: "assignment_architect",
      payload: {},
    });
    await laser.emit({
      event_type: "assignment.concepts.extracted",
      run_id: RUN,
      source_agent: "assignment_architect",
      payload: {},
    });

    const seen: string[] = [];
    const unsubscribe = laser.subscribe(
      RUN,
      (event) => seen.push(event.event_type),
      { fromOffset: 1n },
    );
    await laser.emit({
      event_type: "groups.proposed",
      run_id: RUN,
      source_agent: "grouping_agent",
      payload: {},
    });
    unsubscribe();

    expect(seen).toEqual(["assignment.concepts.extracted", "groups.proposed"]);
  });

  it("continues live when a subscription offset is beyond existing history", async () => {
    const { laser } = getAdapters();
    await laser.emit({
      event_type: "assignment.uploaded",
      run_id: RUN,
      source_agent: "assignment_architect",
      payload: {},
    });

    const seen: string[] = [];
    const unsubscribe = laser.subscribe(
      RUN,
      (event) => seen.push(event.event_type),
      { fromOffset: 99n },
    );
    await laser.emit({
      event_type: "groups.proposed",
      run_id: RUN,
      source_agent: "grouping_agent",
      payload: {},
    });
    unsubscribe();

    expect(seen).toEqual(["groups.proposed"]);
  });

  it("ingests live student activity onto the run topic", async () => {
    const { laser } = getAdapters();
    await laser.ingestActivity({
      run_id: RUN,
      student_id: "maya",
      kind: "submission",
      payload: { answer: "-4" },
      observed_at: "2026-08-03T10:00:00.000Z",
    });
    expect(await laser.listTopics()).toContain(RUN);
  });
});

describe("RocketRide — motion layer", () => {
  it("runs each pipeline deterministically and returns a task token", async () => {
    const { rocketride } = getAdapters();
    const result = await rocketride.run({ task: "concept_extraction", prompt: "extract" });

    expect(result.deterministic).toBe(true);
    expect(result.token).toMatch(/^mock_\d{4}$/);
    expect(result.output).toHaveProperty("concepts");
  });

  it("validates output against a schema when one is supplied", async () => {
    const { rocketride } = getAdapters();
    const schema = z.object({ objective_preserved: z.boolean(), rigor_preserved: z.boolean() });

    const result = await rocketride.run({ task: "variant_generation", prompt: "adapt" }, schema);
    expect(result.output.objective_preserved).toBe(true);
    expect(result.output.rigor_preserved).toBe(true);
  });

  it("rejects output that does not satisfy the schema", async () => {
    const { rocketride } = getAdapters();
    rocketride.setMockResponse("concept_extraction", { concepts: "not-an-array" });

    await expect(
      rocketride.run({ task: "concept_extraction", prompt: "x" }, z.object({ concepts: z.array(z.unknown()) })),
    ).rejects.toThrow();
  });

  it("lets a lane override a task with its own fixtures", async () => {
    const { rocketride } = getAdapters();
    rocketride.setMockResponse("lesson_plan_synthesis", { whole_class_intervention: "custom" });

    const result = await rocketride.run({ task: "lesson_plan_synthesis", prompt: "plan" });
    expect(result.output).toEqual({ whole_class_intervention: "custom" });
  });

  it("exposes the four registered pipelines", async () => {
    const { rocketride } = getAdapters();
    expect(await rocketride.listPipelines()).toHaveLength(4);
  });
});

describe("Guild.ai — agent layer", () => {
  it("registers all nine agents idempotently with permissions", async () => {
    const { guild } = getAdapters();
    const registered = await guild.registerDefaultAgents();
    expect(registered).toHaveLength(9);

    await guild.registerDefaultAgents();
    expect(await guild.listAgents()).toHaveLength(9);
    expect(registered[0].permissions.length).toBeGreaterThan(0);
  });

  it("opens a human approval gate when an agent run is low confidence", async () => {
    const { guild } = getAdapters();
    await guild.recordAgentRun({
      run_id: RUN,
      agent: "assessment_agent",
      status: "completed",
      confidence: 0.41,
      evidence_refs: ["sub_7"],
      human_review_required: true,
    });

    const gates = await guild.listApprovals(RUN);
    expect(gates).toHaveLength(1);
    expect(gates[0].gate_type).toBe("low_confidence_grade");
    expect(gates[0].status).toBe("pending");
  });

  it("does not open a gate for a confident run", async () => {
    const { guild } = getAdapters();
    await guild.recordAgentRun({
      run_id: RUN,
      agent: "assessment_agent",
      status: "completed",
      confidence: 0.95,
      evidence_refs: [],
      human_review_required: false,
    });
    expect(await guild.listApprovals(RUN)).toHaveLength(0);
  });

  it("resolves a gate and records who decided", async () => {
    const { guild } = getAdapters();
    const gate = await guild.requestApproval({
      run_id: RUN,
      gate_type: "final_plan",
      subject_id: "lesson_planner",
      reason: "Final plan requires educator approval.",
    });

    const resolved = await guild.resolveApproval(gate.gate_id, "approved");
    expect(resolved?.status).toBe("approved");
    expect(resolved?.resolved_at).not.toBeNull();
    expect(await guild.resolveApproval("gate_missing", "approved")).toBeNull();
  });

  it("records explicit handoffs between specialist agents", async () => {
    const { guild } = getAdapters();
    const handoff = await guild.handoff({
      run_id: RUN,
      from_agent: "grouping_agent",
      to_agent: "accessibility_agent",
      reason: "Rooms formed; delivery supports needed.",
      payload_refs: ["ember"],
    });

    expect(handoff.handoff_id).toMatch(/^handoff_\d{3}$/);
    expect(await guild.listHandoffs(RUN)).toHaveLength(1);
  });

  it("records review gates in Guild traces", async () => {
    const { guild } = getAdapters();
    await guild.requestApproval({
      run_id: RUN,
      gate_type: "final_plan",
      subject_id: "lesson_planner",
      reason: "Educator sign-off.",
    });
    const traces = await guild.listTraces(RUN);
    expect(traces.some((trace) => trace.action === "guild.approval_requested:final_plan")).toBe(true);
  });
});
