import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdapters } from "@/server/adapters";
import { resetLocalEvents } from "@/server/eventBridge";
import { resetRunStore } from "@/server/runStore";
import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3001/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/runs assignment motion", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPONSOR_MODE", "mock");
    await resetAdapters();
    resetRunStore();
    resetLocalEvents();
  });

  it("runs uploaded text through the asynchronous motion path", async () => {
    const response = await POST(
      request({
        title: "Uploaded equations",
        assignment_text:
          "1. Expand: 2(x + 3)\n2. Solve: 5(x - 1) = 20",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.state.demo_mode).toBe(false);
    expect(body.state.assignment.title).toBe("Uploaded equations");
    expect(body.state.assignment.source).toBe("upload");
    expect(body.agent_results.architect.evidence_refs).toContain(
      "rocketride:mock_0001",
    );
    expect(body.agent_results.curator.evidence_refs).toContain(
      "rocketride:mock_0002",
    );
  });

  it("rejects an upload that explicitly requests demo mode", async () => {
    const response = await POST(
      request({
        demo_mode: true,
        assignment_text: "1. Solve: x + 1 = 2",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_assignment_input");
  });
});
