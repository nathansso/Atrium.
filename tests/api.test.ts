import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { runStateSchema } from "@/contracts";
import { POST as createRunRoute, GET as listRunsRoute } from "@/app/api/runs/route";
import { GET as getRunRoute } from "@/app/api/runs/[runId]/route";
import { GET as getStudentRoute } from "@/app/api/students/[studentId]/route";
import { GET as getRoomRoute } from "@/app/api/rooms/[roomId]/route";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";

const BASE = "http://localhost:3000";

function post(path: string, body?: unknown): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(path: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, { method: "GET" });
}

async function startRun() {
  const response = await createRunRoute(post("/api/runs", { demo_mode: true }));
  return (await response.json()) as {
    run_id: string;
    state: unknown;
    agent_results: Record<string, { confidence: number }>;
  };
}

describe("API routes", () => {
  beforeEach(() => {
    resetRunStore();
    resetLocalEvents();
  });

  describe("POST /api/runs", () => {
    it("creates a run and returns 201 with the full state", async () => {
      const response = await createRunRoute(post("/api/runs", {}));
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.run_id).toMatch(/^run_/);
      expect(() => runStateSchema.parse(body.state)).not.toThrow();
      expect(body.state.status).toBe("variants_ready");
      expect(Object.keys(body.agent_results)).toEqual([
        "architect",
        "memory",
        "grouping",
        "accessibility",
        "curator",
      ]);
    });

    it("accepts an empty body", async () => {
      const response = await createRunRoute(post("/api/runs"));
      expect(response.status).toBe(201);
    });

    it("rejects a malformed body with 400", async () => {
      const response = await createRunRoute(
        post("/api/runs", { demo_mode: "yes please" }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_request");
    });

    it("returns 404 for an unknown assignment id", async () => {
      const response = await createRunRoute(
        post("/api/runs", { assignment_id: "asg_nope" }),
      );
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("assignment_not_found");
    });
  });

  describe("GET /api/runs/:runId", () => {
    it("returns the current run state", async () => {
      const created = await startRun();
      const response = await getRunRoute(get(`/api/runs/${created.run_id}`), {
        params: Promise.resolve({ runId: created.run_id }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.state.run_id).toBe(created.run_id);
      expect(body.state.rooms.length).toBeGreaterThanOrEqual(3);
      expect(body.state.events).toHaveLength(6);
    });

    it("returns 404 for an unknown run", async () => {
      const response = await getRunRoute(get("/api/runs/run_missing"), {
        params: Promise.resolve({ runId: "run_missing" }),
      });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("run_not_found");
    });

    it("lists created runs", async () => {
      await startRun();
      const response = await listRunsRoute();
      const body = await response.json();
      expect(body.runs).toHaveLength(1);
      expect(body.runs[0].event_count).toBe(6);
    });
  });

  describe("GET /api/students/:studentId", () => {
    it("returns the private contextual card after a run", async () => {
      const created = await startRun();
      const response = await getStudentRoute(get("/api/students/stu_01"), {
        params: Promise.resolve({ studentId: "stu_01" }),
      });

      expect(response.status).toBe(200);
      const card = await response.json();
      expect(card.run_id).toBe(created.run_id);
      expect(card.student.student_id).toBe("stu_01");
      expect(card.context.active_misconceptions.length).toBeGreaterThan(0);
      expect(card.room.room_id).toBe("ember");
      expect(card.placement.rationale.length).toBeGreaterThan(0);
      expect(card.accessibility.objectives_modified).toBe(false);
      expect(card.overlay.changes_item_content).toBe(false);
      expect(card.variant_id).toContain("ember");
    });

    it("serves a run-less card before any run exists", async () => {
      const response = await getStudentRoute(get("/api/students/stu_05"), {
        params: Promise.resolve({ studentId: "stu_05" }),
      });
      expect(response.status).toBe(200);
      const card = await response.json();
      expect(card.run_id).toBeNull();
      expect(card.student.student_id).toBe("stu_05");
      expect(card.room).toBeNull();
    });

    it("returns 404 for an unknown student", async () => {
      const response = await getStudentRoute(get("/api/students/stu_99"), {
        params: Promise.resolve({ studentId: "stu_99" }),
      });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("student_not_found");
    });

    it("honours an explicit run_id", async () => {
      const created = await startRun();
      const response = await getStudentRoute(
        get(`/api/students/stu_05?run_id=${created.run_id}`),
        { params: Promise.resolve({ studentId: "stu_05" }) },
      );
      expect((await response.json()).run_id).toBe(created.run_id);
    });
  });

  describe("GET /api/rooms/:roomId", () => {
    it("returns focus, evidence, members, and the room variant", async () => {
      const created = await startRun();
      const response = await getRoomRoute(get("/api/rooms/harbor"), {
        params: Promise.resolve({ roomId: "harbor" }),
      });

      expect(response.status).toBe(200);
      const detail = await response.json();
      expect(detail.run_id).toBe(created.run_id);
      expect(detail.room.name).toBe("Harbor");
      expect(detail.room.evidence_refs.length).toBeGreaterThan(0);
      expect(detail.focus_concepts.length).toBeGreaterThan(0);
      expect(detail.members.length).toBeGreaterThanOrEqual(2);
      expect(detail.members[0].rationale.length).toBeGreaterThan(0);
      expect(detail.variant.room_id).toBe("harbor");
      expect(detail.variant.objective_preservation.preserved).toBe(true);
      expect(detail.delivery_note).toContain("Harbor");
    });

    it("returns 400 for a room id outside the contract", async () => {
      const response = await getRoomRoute(get("/api/rooms/basement"), {
        params: Promise.resolve({ roomId: "basement" }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_room_id");
    });

    it("returns 404 before any run has built the room", async () => {
      const response = await getRoomRoute(get("/api/rooms/ember"), {
        params: Promise.resolve({ roomId: "ember" }),
      });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("room_not_built");
    });
  });
});
