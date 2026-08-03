import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/contracts";
import { emitEvent, getRunEvents, getSubscriberCount, resetEventBus } from "@/server/events";
import { GET, POST } from "./route";

const RUN = "run_sse";

function makeContext(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

function makeGetRequest(signal?: AbortSignal, query = ""): Request {
  return new Request(`http://localhost/api/runs/${RUN}/events${query}`, { signal });
}

/** Read SSE chunks until the accumulated text contains `count` data lines. */
async function readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  count: number,
): Promise<AgentEvent[]> {
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = () =>
    buffer
      .split("\n\n")
      .filter((block) => block.includes("data: "))
      .map((block) => {
        const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
        return JSON.parse(dataLine!.slice("data: ".length)) as AgentEvent;
      });

  while (parse().length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  return parse();
}

describe("GET /api/runs/:runId/events", () => {
  beforeEach(() => {
    resetEventBus();
  });

  it("replays history, then streams live events, and unsubscribes on abort", async () => {
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    emitEvent({
      run_id: RUN,
      event_type: "assignment.concepts.extracted",
      source_agent: "assignment_architect",
    });

    const controller = new AbortController();
    const response = await GET(makeGetRequest(controller.signal), makeContext(RUN));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const reader = response.body!.getReader();

    // History replay
    const history = await readEvents(reader, 2);
    expect(history.map((event) => event.event_type)).toEqual([
      "assignment.uploaded",
      "assignment.concepts.extracted",
    ]);
    expect(getSubscriberCount(RUN)).toBe(1);

    // Live event (fresh read buffer, so expect exactly the one new event)
    emitEvent({ run_id: RUN, event_type: "groups.proposed", source_agent: "grouping_agent" });
    const live = await readEvents(reader, 1);
    expect(live[0].event_type).toBe("groups.proposed");
    expect(live[0].source_agent).toBe("grouping_agent");

    // Abort closes the stream and removes the subscriber
    controller.abort();
    const { done } = await reader.read();
    expect(done).toBe(true);
    expect(getSubscriberCount(RUN)).toBe(0);
  });

  it("uses the agent-event SSE event name", async () => {
    emitEvent({ run_id: RUN, event_type: "lesson.plan.ready", source_agent: "lesson_planner" });

    const controller = new AbortController();
    const response = await GET(makeGetRequest(controller.signal), makeContext(RUN));
    const { value } = await response.body!.getReader().read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: agent-event\n");
    expect(text).toContain('"event_type":"lesson.plan.ready"');
    controller.abort();
  });

  it("supports multiple concurrent subscribers", async () => {
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const responseA = await GET(makeGetRequest(controllerA.signal), makeContext(RUN));
    const responseB = await GET(makeGetRequest(controllerB.signal), makeContext(RUN));
    expect(getSubscriberCount(RUN)).toBe(2);

    emitEvent({ run_id: RUN, event_type: "submissions.received", source_agent: "assessment_agent" });

    const [eventsA, eventsB] = await Promise.all([
      readEvents(responseA.body!.getReader(), 1),
      readEvents(responseB.body!.getReader(), 1),
    ]);
    expect(eventsA[0].event_type).toBe("submissions.received");
    expect(eventsB[0].event_type).toBe("submissions.received");

    controllerA.abort();
    controllerB.abort();
  });

  it("returns plain JSON history when requested", async () => {
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });

    const response = await GET(makeGetRequest(undefined, "?format=json"), makeContext(RUN));
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.run_id).toBe(RUN);
    expect(body.events).toHaveLength(1);
  });
});

describe("POST /api/runs/:runId/events", () => {
  beforeEach(() => {
    resetEventBus();
    vi.stubEnv("SPONSOR_MODE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("injects a validated event in mock mode", async () => {
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "student.models.updated",
        source_agent: "classroom_evolution_agent",
        payload: { moved: ["s4"] },
      }),
    });

    const response = await POST(request, makeContext(RUN));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.event.event_id).toMatch(/^evt_/);
    expect(getRunEvents(RUN)).toHaveLength(1);
  });

  it("rejects invalid payloads with 400", async () => {
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      method: "POST",
      body: JSON.stringify({ event_type: "not.a.real.event", source_agent: "grouping_agent" }),
    });

    const response = await POST(request, makeContext(RUN));
    expect(response.status).toBe(400);
    expect(getRunEvents(RUN)).toHaveLength(0);
  });

  it("is disabled outside mock mode", async () => {
    vi.stubEnv("SPONSOR_MODE", "live");
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      method: "POST",
      body: JSON.stringify({
        event_type: "assignment.uploaded",
        source_agent: "assignment_architect",
      }),
    });

    const response = await POST(request, makeContext(RUN));
    expect(response.status).toBe(403);
  });
});
