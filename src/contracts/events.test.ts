import { describe, expect, it } from "vitest";
import { agentEventSchema } from "./events";

describe("agent event contract", () => {
  it("rejects event IDs that can inject SSE control lines", () => {
    const result = agentEventSchema.safeParse({
      event_id: "evt_1\nretry: 0",
      event_type: "assignment.uploaded",
      run_id: "run_contract",
      source_agent: "assignment_architect",
      timestamp: "2026-08-03T00:00:00.000Z",
      payload: {},
    });

    expect(result.success).toBe(false);
  });
});
