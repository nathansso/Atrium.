import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/contracts";
import { emitEvent, getRunEvents, getSubscriberCount, resetEventBus } from "@/server/events";
import { GET, POST } from "./route";

const RUN = "run_sse";

const laser = vi.hoisted(() => ({
  mode: "mock" as "mock" | "live",
  ensureTopic: vi.fn(),
  replay: vi.fn(),
  subscribe: vi.fn(),
}));

const trace = vi.hoisted(() => vi.fn());

vi.mock("@/server/adapters", () => ({
  getAdapters: () => ({
    laser: {
      info: () => ({ name: "laser", mode: laser.mode, provider: "test" }),
      ensureTopic: laser.ensureTopic,
      replay: laser.replay,
      subscribe: laser.subscribe,
    },
  }),
}));

vi.mock("@/server/platform/guildWorkflow", () => ({ trace }));

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
    laser.mode = "mock";
    laser.ensureTopic.mockReset().mockResolvedValue(undefined);
    laser.replay.mockReset().mockResolvedValue([]);
    laser.subscribe.mockReset().mockReturnValue(() => {});
    trace.mockReset().mockResolvedValue(undefined);
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

    expect(text).toContain("id: ");
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

  it("resumes mock SSE history after Last-Event-ID", async () => {
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    const previous = emitEvent({
      run_id: RUN,
      event_type: "assignment.concepts.extracted",
      source_agent: "assignment_architect",
    });
    emitEvent({ run_id: RUN, event_type: "groups.proposed", source_agent: "grouping_agent" });

    const controller = new AbortController();
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      signal: controller.signal,
      headers: { "Last-Event-ID": previous.event_id },
    });
    const response = await GET(request, makeContext(RUN));

    expect((await readEvents(response.body!.getReader(), 1)).map((event) => event.event_type))
      .toEqual(["groups.proposed"]);
    controller.abort();
  });

  it("replays mock SSE history from the start for an unknown Last-Event-ID", async () => {
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    emitEvent({ run_id: RUN, event_type: "groups.proposed", source_agent: "grouping_agent" });

    const controller = new AbortController();
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      signal: controller.signal,
      headers: { "Last-Event-ID": "evt_missing" },
    });
    const response = await GET(request, makeContext(RUN));

    expect((await readEvents(response.body!.getReader(), 2)).map((event) => event.event_type))
      .toEqual(["assignment.uploaded", "groups.proposed"]);
    controller.abort();
  });

  it("reads JSON history from Laser in live mode", async () => {
    laser.mode = "live";
    const event = emitEvent({
      run_id: RUN,
      event_type: "assignment.uploaded",
      source_agent: "assignment_architect",
    });
    resetEventBus();
    laser.replay.mockResolvedValue([
      { event, offset: 7n },
      { event, offset: 8n },
    ]);

    const response = await GET(makeGetRequest(undefined, "?format=json"), makeContext(RUN));
    const body = await response.json();

    expect(body.events).toEqual([event]);
    expect(laser.replay).toHaveBeenCalledWith(RUN);
  });

  it("streams Laser from offset zero without subscribing to the local bus", async () => {
    laser.mode = "live";
    const event = emitEvent({
      run_id: RUN,
      event_type: "groups.proposed",
      source_agent: "grouping_agent",
    });
    resetEventBus();
    const unsubscribe = vi.fn();
    laser.subscribe.mockImplementation((_runId, onEvent) => {
      queueMicrotask(() => onEvent(event));
      return unsubscribe;
    });

    const controller = new AbortController();
    const response = await GET(makeGetRequest(controller.signal), makeContext(RUN));
    const events = await readEvents(response.body!.getReader(), 1);

    expect(events).toEqual([event]);
    expect(laser.ensureTopic).toHaveBeenCalledWith(RUN);
    expect(laser.subscribe).toHaveBeenCalledWith(
      RUN,
      expect.any(Function),
      expect.objectContaining({ fromOffset: 0n, onError: expect.any(Function) }),
    );
    expect(getSubscriberCount(RUN)).toBe(0);
    controller.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });

  it("resumes a live Laser stream after the browser's last SSE event", async () => {
    laser.mode = "live";
    const previous = emitEvent({
      run_id: RUN,
      event_type: "assignment.uploaded",
      source_agent: "assignment_architect",
    });
    resetEventBus();
    laser.replay.mockResolvedValue([
      { event: previous, offset: 12n },
      { event: previous, offset: 14n },
    ]);

    const controller = new AbortController();
    const request = new Request(`http://localhost/api/runs/${RUN}/events`, {
      signal: controller.signal,
      headers: { "Last-Event-ID": previous.event_id },
    });
    await GET(request, makeContext(RUN));

    expect(laser.subscribe).toHaveBeenCalledWith(
      RUN,
      expect.any(Function),
      expect.objectContaining({ fromOffset: 15n, onError: expect.any(Function) }),
    );
    controller.abort();
  });

  it("closes the SSE response when the live Laser subscription fails", async () => {
    laser.mode = "live";
    const unsubscribe = vi.fn();
    laser.subscribe.mockReturnValue(unsubscribe);

    const response = await GET(makeGetRequest(), makeContext(RUN));
    const reader = response.body!.getReader();
    const options = laser.subscribe.mock.calls[0][2];
    options.onError(new Error("connection lost"));

    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledOnce();
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
