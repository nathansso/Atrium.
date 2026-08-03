import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent } from "@/server/events";
import { closeLiveLaser, createLiveLaserAdapter } from "./laserStream";

const sdk = vi.hoisted(() => ({ connectWithStream: vi.fn() }));

vi.mock("@laserdata/laser-sdk", () => ({
  Laser: { connectWithStream: sdk.connectWithStream },
}));

const encoder = new TextEncoder();

function eventMessage(eventType: "assignment.uploaded" | "groups.proposed", offset: bigint) {
  const event = createEvent({
    run_id: "run_live",
    event_type: eventType,
    source_agent: eventType === "assignment.uploaded" ? "assignment_architect" : "grouping_agent",
    payload: {},
  });
  return { payload: encoder.encode(JSON.stringify(event)), offset };
}

function messages(items: Array<{ payload: Uint8Array; offset: bigint }>, error?: Error) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
      if (error) throw error;
    },
  };
}

describe("live LaserData adapter", () => {
  let topic: {
    ensure: ReturnType<typeof vi.fn>;
    consumer: ReturnType<typeof vi.fn>;
    replay: ReturnType<typeof vi.fn>;
  };
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("LASER_CONNECTION_STRING", "root:secret@laser.example:8090");
    vi.stubEnv("LASER_STREAM", "atrium");
    topic = {
      ensure: vi.fn().mockResolvedValue(undefined),
      consumer: vi.fn(),
      replay: vi.fn(),
    };
    close = vi.fn().mockResolvedValue(undefined);
    sdk.connectWithStream.mockReset().mockResolvedValue({
      stream: vi.fn(() => ({ topic: vi.fn(() => topic) })),
      close,
    });
  });

  afterEach(async () => {
    await closeLiveLaser();
    vi.unstubAllEnvs();
  });

  it("uses a replay cursor for offset subscriptions and skips malformed messages", async () => {
    const fromOffsets = vi.fn(() => ({
      stream: vi.fn(() => messages([
        { payload: encoder.encode("not-json"), offset: 7n },
        eventMessage("assignment.uploaded", 8n),
        eventMessage("groups.proposed", 9n),
      ])),
    }));
    topic.replay.mockResolvedValue({ fromOffsets });
    const listener = vi.fn()
      .mockImplementationOnce(() => { throw new Error("listener failed"); })
      .mockImplementation(() => undefined);

    const unsubscribe = createLiveLaserAdapter().subscribe("run_live", listener, { fromOffset: 7n });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    expect(fromOffsets).toHaveBeenCalledWith(new Map([[0, 7n]]));
    expect(listener.mock.calls[1][0].event_type).toBe("groups.proposed");
    unsubscribe();
  });

  it("uses the live consumer and reports transport failures", async () => {
    const failure = new Error("connection lost");
    const stream = vi.fn(() => messages([], failure));
    topic.consumer.mockReturnValue({ stream });
    const onError = vi.fn();

    createLiveLaserAdapter().subscribe("run_live", vi.fn(), { onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));

    expect(topic.consumer).toHaveBeenCalledWith(0, { autoCommit: true });
    expect(stream).toHaveBeenCalledOnce();
  });

  it("finds the largest durable offset across batches and handles an empty topic", async () => {
    const emptyPoll = vi.fn().mockResolvedValue([]);
    const populatedPoll = vi.fn()
      .mockResolvedValueOnce([
        { offset: 2n, payload: new Uint8Array() },
        { offset: 5n, payload: new Uint8Array() },
      ])
      .mockResolvedValueOnce([{ offset: 8n, payload: new Uint8Array() }])
      .mockResolvedValueOnce([]);
    topic.replay
      .mockResolvedValueOnce({ poll: emptyPoll })
      .mockResolvedValueOnce({ poll: populatedPoll });
    const adapter = createLiveLaserAdapter();

    expect(await adapter.latestOffset("run_empty")).toBe(-1n);
    expect(await adapter.latestOffset("run_live")).toBe(8n);
  });

  it("closes the shared SDK connection", async () => {
    topic.consumer.mockReturnValue({ stream: vi.fn(() => messages([])) });
    createLiveLaserAdapter().subscribe("run_live", vi.fn());
    await vi.waitFor(() => expect(sdk.connectWithStream).toHaveBeenCalledOnce());

    await closeLiveLaser();

    expect(close).toHaveBeenCalledOnce();
  });
});
