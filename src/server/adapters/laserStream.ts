/**
 * Live LaserData adapter — the streaming layer, backed by real Apache Iggy
 * topics through @laserdata/laser-sdk.
 *
 * One topic per run (`run-<runId>`) inside the configured stream, created with
 * a single partition so offsets form one totally-ordered log. That ordering is
 * what lets the UI scrubber replay a run by durable offset rather than by
 * array index.
 *
 * The SDK also ships a graph, a KV store and an agent runtime. We deliberately
 * use only its streaming surface so FalkorDB and Guild.ai keep real work.
 *
 * Delivery is at-least-once, so listeners must be idempotent — the contract in
 * types.ts says so and this implementation genuinely can redeliver.
 */
// The SDK is loaded lazily, never at module scope. It evaluates BigInt work on
// import, which crashes Next's build-time page-data collection for every route
// that transitively reaches the adapter factory. Deferring it also keeps mock
// mode from paying for a vendor SDK it never calls.
import type { Laser } from "@laserdata/laser-sdk";
import { agentEventSchema, type AgentEvent } from "@/contracts";
import { getEnvConfig } from "@/server/config";
import { createEvent, type EventInput, type EventListener } from "@/server/events";
import type {
  ActivityRecord,
  AdapterInfo,
  LaserStreamAdapter,
  StreamedEvent,
  StreamSubscriptionOptions,
} from "./types";

/** Iggy topic names allow alphanumerics, dashes and underscores. */
function topicName(runId: string): string {
  return `run-${runId}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

type GlobalWithLaser = typeof globalThis & {
  __atrium_laser_live__?: Promise<Laser>;
  __atrium_laser_topics__?: Set<string>;
};

function connect(): Promise<Laser> {
  const store = globalThis as GlobalWithLaser;
  if (!store.__atrium_laser_live__) {
    const config = getEnvConfig();
    const connectionString = config.laserConnectionString;
    if (!connectionString) {
      return Promise.reject(new Error("LASER_CONNECTION_STRING is required for live mode"));
    }
    store.__atrium_laser_live__ = import("@laserdata/laser-sdk")
      .then((mod) => mod.Laser.connectWithStream(connectionString, config.laserStream))
      .catch((error: unknown) => {
        delete store.__atrium_laser_live__;
        throw error;
      });
  }
  return store.__atrium_laser_live__;
}

/** Topics this process has already ensured, so hot paths skip the round-trip. */
function ensuredTopics(): Set<string> {
  const store = globalThis as GlobalWithLaser;
  store.__atrium_laser_topics__ ??= new Set<string>();
  return store.__atrium_laser_topics__;
}

async function topicFor(runId: string, partitions = 1) {
  const laser = await connect();
  const config = getEnvConfig();
  const name = topicName(runId);
  const topic = laser.stream(config.laserStream).topic(name);
  if (!ensuredTopics().has(name)) {
    await topic.ensure(partitions);
    ensuredTopics().add(name);
  }
  return topic;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const REPLAY_BATCH_SIZE = 500;

/**
 * Decodes one Iggy message back into an AgentEvent. Parsing is strict: a
 * malformed frame is skipped rather than allowed to poison a replay.
 */
function decodeEvent(payload: Uint8Array): AgentEvent | null {
  try {
    return agentEventSchema.parse(JSON.parse(decoder.decode(payload)));
  } catch {
    return null;
  }
}

export function createLiveLaserAdapter(): LaserStreamAdapter {
  const adapter: LaserStreamAdapter = {
    info(): AdapterInfo {
      return { name: "laser", mode: "live", provider: "apache-iggy" };
    },

    async ensureTopic(runId: string, partitions = 1): Promise<void> {
      await topicFor(runId, partitions);
    },

    async publish(event: AgentEvent): Promise<void> {
      const topic = await topicFor(event.run_id);
      await topic.send(encoder.encode(JSON.stringify(event)));
    },

    async emit(input: EventInput): Promise<AgentEvent> {
      const event = createEvent(input);
      await adapter.publish(event);
      return event;
    },

    /**
     * Live student activity is the "motion" input signal. It rides the same
     * run topic as agent events so a replay shows cause and effect interleaved
     * in the order they actually happened.
     */
    async ingestActivity(activity: ActivityRecord): Promise<void> {
      const topic = await topicFor(activity.run_id);
      // `record_type`, not `kind` — ActivityRecord already uses `kind` for
      // submission/attempt/hint_request/idle, which must survive the round trip.
      await topic.send(
        encoder.encode(JSON.stringify({ record_type: "activity", ...activity })),
      );
    },

    subscribe(
      runId: string,
      onEvent: EventListener,
      options: StreamSubscriptionOptions = {},
    ): () => void {
      const controller = new AbortController();

      void (async () => {
        try {
          const topic = await topicFor(runId);
          const messages = options.fromOffset === undefined
            ? topic.consumer(0, { autoCommit: true }).stream({ signal: controller.signal })
            : (await topic.replay())
                .fromOffsets(new Map([[0, options.fromOffset]]))
                .stream({ signal: controller.signal });
          for await (const message of messages) {
            const event = decodeEvent(message.payload);
            if (!event) continue;
            try {
              onEvent(event);
            } catch (error) {
              console.error("[laser] subscriber threw", event.event_id, error);
            }
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            console.error(`[laser] subscription to ${runId} ended`, error);
            options.onError?.(error);
          }
        }
      })();

      return () => controller.abort();
    },

    /** Durable replay from an offset — what the UI scrubber reads. */
    async replay(runId: string, fromOffset = 0n): Promise<StreamedEvent[]> {
      const topic = await topicFor(runId);
      const cursor = (await topic.replay({ batchSize: REPLAY_BATCH_SIZE })).fromOffsets(
        new Map([[0, fromOffset]]),
      );

      const out: StreamedEvent[] = [];
      // Poll until a batch comes back empty: that is the end of the log.
      for (;;) {
        const batch = await cursor.poll();
        if (batch.length === 0) break;
        for (const message of batch) {
          const event = decodeEvent(message.payload);
          if (event) out.push({ event, offset: message.offset });
        }
      }
      return out;
    },

    async latestOffset(runId: string): Promise<bigint> {
      const topic = await topicFor(runId);
      const cursor = await topic.replay({ batchSize: REPLAY_BATCH_SIZE });
      let latest = -1n;
      for (;;) {
        const batch = await cursor.poll();
        if (batch.length === 0) return latest;
        for (const message of batch) {
          if (message.offset > latest) latest = message.offset;
        }
      }
    },

    async listTopics(): Promise<string[]> {
      return [...ensuredTopics()].sort();
    },
  };

  return adapter;
}

/** Closes the pooled connection. Used by tests and by resetAdapters(). */
export async function closeLiveLaser(): Promise<void> {
  const store = globalThis as GlobalWithLaser;
  const pending = store.__atrium_laser_live__;
  delete store.__atrium_laser_live__;
  delete store.__atrium_laser_topics__;
  if (!pending) return;
  try {
    const laser = await pending;
    await laser.close();
  } catch {
    // A connection that never opened needs no closing.
  }
}
