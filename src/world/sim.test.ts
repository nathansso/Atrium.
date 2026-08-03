import { describe, expect, it } from "vitest";
import { eventTypes, isAgentEvent, roomIds } from "@/contracts";
import { buildMockEvents, mockPhaseOneEvents, mockPhaseTwoEvents } from "./mock/events";
import { MOCK_RUN_ID, mockStudents } from "./mock/seed";
import { ORIGIN_X, ORIGIN_Y, screenToTile, tileToScreen } from "./iso";
import { hitTest } from "./hitTest";
import { WORLD_LAYOUT, buildingCenter, getBuilding, roomBuildingId } from "./layout";
import {
  createWorldState,
  ingestEvent,
  isSettled,
  renderWorldToText,
  roomMembers,
  stepWorld,
} from "./sim";
import { applyEventToProjection, createRunProjection, roomCounts } from "./runState";

function drive(seconds: number, state = createWorldState()) {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) stepWorld(state, 1 / 60);
  return state;
}

describe("isometric projection", () => {
  it("round-trips screen and tile coordinates", () => {
    const tile = screenToTile(ORIGIN_X + 137, ORIGIN_Y - 62);
    const back = tileToScreen(tile.x, tile.y);
    expect(back.sx).toBeCloseTo(ORIGIN_X + 137, 6);
    expect(back.sy).toBeCloseTo(ORIGIN_Y - 62, 6);
  });

  it("keeps the whole authored campus inside the base canvas", () => {
    for (const spec of WORLD_LAYOUT) {
      const front = tileToScreen(
        spec.tile.x + spec.size.x,
        spec.tile.y + spec.size.y,
      );
      const top = tileToScreen(spec.tile.x, spec.tile.y, spec.height);
      expect(top.sy).toBeGreaterThan(0);
      expect(front.sy).toBeLessThan(470);
      expect(front.sx).toBeGreaterThan(-20);
      expect(front.sx).toBeLessThan(700);
    }
  });
});

describe("mock event sequence", () => {
  const events = buildMockEvents(MOCK_RUN_ID);

  it("covers every contract event type exactly once", () => {
    expect(events.map((event) => event.event_type)).toEqual([...eventTypes]);
  });

  it("emits valid AgentEvent envelopes", () => {
    for (const event of events) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      expect(isAgentEvent(envelope)).toBe(true);
    }
  });

  it("splits into a pre-simulation and post-simulation phase", () => {
    expect(mockPhaseOneEvents()).toHaveLength(6);
    expect(mockPhaseTwoEvents()).toHaveLength(5);
    expect(mockPhaseTwoEvents()[0].event_type).toBe("submissions.received");
  });
});

describe("world reducer", () => {
  it("starts with unbuilt room plots and only the professor and guide", () => {
    const state = createWorldState();
    for (const roomId of roomIds) {
      expect(state.buildings[roomBuildingId(roomId)].level).toBe(0);
    }
    expect(state.actors).toHaveLength(2);
    expect(state.phase).toBe("idle");
  });

  it("produces a visible change for every contract event", () => {
    const events = buildMockEvents(MOCK_RUN_ID);
    let state = createWorldState();
    const snapshots: string[] = [renderWorldToText(state)];

    for (const event of events) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      ingestEvent(state, envelope);
      // Let the animation resolve so the change is observable, not just queued.
      state = drive(2.5, state);
      const text = renderWorldToText(state);
      expect(text).not.toBe(snapshots[snapshots.length - 1]);
      snapshots.push(text);
    }
    expect(snapshots).toHaveLength(events.length + 1);
  });

  it("raises rooms from foundation to full height across grouping and variants", () => {
    const state = createWorldState();
    const events = buildMockEvents(MOCK_RUN_ID);
    const upTo = (type: string) => {
      for (const event of events) {
        const { delay_ms: _delay, ...envelope } = event;
        void _delay;
        ingestEvent(state, envelope);
        if (event.event_type === type) break;
      }
    };

    upTo("groups.proposed");
    drive(3, state);
    const foundation = state.buildings.room_ember.level;
    expect(foundation).toBeGreaterThan(0.2);
    expect(foundation).toBeLessThan(0.5);

    upTo("assignment.variants.ready");
    drive(4, state);
    expect(state.buildings.room_ember.level).toBeGreaterThan(0.95);
    expect(state.buildings.room_ember.hasScroll).toBe(true);
  });

  it("places every student in a room and moves them on regrouping", () => {
    const state = createWorldState();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      ingestEvent(state, envelope);
      drive(2, state);
    }

    const placed = roomIds.reduce(
      (total, roomId) => total + roomMembers(state, roomId).length,
      0,
    );
    expect(placed).toBe(mockStudents.length);
    // Regrouping moved three students, so the even 3/3/3/3 split must be gone.
    const counts = roomIds.map((roomId) => roomMembers(state, roomId).length);
    expect(counts).not.toEqual([3, 3, 3, 3]);
  });

  it("settles after the final event", () => {
    const state = createWorldState();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      ingestEvent(state, envelope);
      drive(3, state);
    }
    drive(10, state);
    expect(isSettled(state)).toBe(true);
  });

  it("ignores malformed payloads instead of throwing", () => {
    const state = createWorldState();
    ingestEvent(state, {
      event_id: "bad_1",
      event_type: "groups.proposed",
      run_id: "run_bad",
      source_agent: "grouping_agent",
      timestamp: "2026-05-13T14:00:00.000Z",
      payload: { rooms: "not-an-array", junk: { nested: [1, 2, 3] } },
    });
    expect(() => drive(1, state)).not.toThrow();
    expect(state.processed).toContain("groups.proposed");
  });
});

describe("render_game_to_text", () => {
  it("describes rooms, concepts and overlays after a full run", () => {
    const state = createWorldState();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      ingestEvent(state, envelope);
      drive(2, state);
    }
    const text = renderWorldToText(state);
    expect(text).toContain("ATRIUM WORLD");
    expect(text).toContain("Assessment Forge");
    expect(text).toContain("Ember");
    expect(text).toContain("Distributive Property");
    expect(text).toContain("professor review requested: yes");
    expect(text).toMatch(/tomorrow plan overlay: (9\d|100)%/);
  });

  it("is deterministic for the same event sequence and elapsed time", () => {
    const run = () => {
      const state = createWorldState();
      for (const event of buildMockEvents(MOCK_RUN_ID)) {
        const { delay_ms: _delay, ...envelope } = event;
        void _delay;
        ingestEvent(state, envelope);
        drive(2, state);
      }
      return renderWorldToText(state);
    };
    expect(run()).toBe(run());
  });
});

describe("hit testing", () => {
  it("resolves a click on the Memory Library roof to that building", () => {
    const state = createWorldState();
    const center = buildingCenter("memory_library");
    const point = tileToScreen(center.x, center.y, getBuilding("memory_library").height);
    const hit = hitTest(state, point.sx, point.sy);
    expect(hit).toEqual({ kind: "building", id: "memory_library" });
  });

  it("resolves a click on a room plot to the room, even before it is built", () => {
    const state = createWorldState();
    const center = buildingCenter("room_harbor");
    const point = tileToScreen(center.x, center.y);
    expect(hitTest(state, point.sx, point.sy)).toEqual({
      kind: "room",
      roomId: "harbor",
    });
  });

  it("returns none for empty ground", () => {
    const state = createWorldState();
    expect(hitTest(state, 4, 4).kind).toBe("none");
  });
});

describe("run projection", () => {
  it("builds the panel state the UI reads", () => {
    let projection = createRunProjection();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      projection = applyEventToProjection(projection, envelope);
    }

    expect(projection.status).toBe("planned");
    expect(projection.assignment?.problems).toHaveLength(8);
    expect(projection.concepts).toHaveLength(4);
    expect(projection.rooms).toHaveLength(4);
    expect(projection.variants).toHaveLength(4);
    expect(projection.assessments).toHaveLength(12);
    expect(projection.lessonPlan?.items.length).toBeGreaterThan(3);
    expect(projection.reviewQueue).toHaveLength(1);
    expect(projection.reviewQueue[0].confidence).toBeLessThan(0.6);
    expect(projection.events).toHaveLength(11);
  });

  it("tracks before/after room counts across regrouping", () => {
    let projection = createRunProjection();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      projection = applyEventToProjection(projection, envelope);
    }
    const ember = roomCounts(projection, "ember");
    expect(ember.before).toBe(3);
    expect(ember.after).toBe(2);
    expect(roomCounts(projection, "summit").after).toBe(4);
  });

  it("keeps every variant objective-preserving", () => {
    let projection = createRunProjection();
    for (const event of buildMockEvents(MOCK_RUN_ID)) {
      const { delay_ms: _delay, ...envelope } = event;
      void _delay;
      projection = applyEventToProjection(projection, envelope);
    }
    for (const variant of projection.variants) {
      expect(variant.objective_preserved).toBe(true);
      expect(variant.problems.length).toBeGreaterThan(0);
    }
  });
});
