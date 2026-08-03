/**
 * GET  /api/runs/:runId/events — SSE stream of agent events for a run.
 *      Replays full history, then streams live events. Send
 *      Accept: application/json (or ?format=json) for a plain history array.
 * POST /api/runs/:runId/events — mock-mode-only event injector so the
 *      frontend can drive animations before the agent loop is merged.
 */
import { z } from "zod";
import { agentNames, eventTypes, type AgentEvent } from "@/contracts";
import { getAdapters } from "@/server/adapters";
import { recordAudit } from "@/server/audit";
import { getEnvConfig } from "@/server/config";
import { emitEvent, getRunEvents, subscribeToRun } from "@/server/events";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

type RouteContext = { params: Promise<{ runId: string }> };

function encodeSse(event: AgentEvent): Uint8Array {
  return new TextEncoder().encode(
    `id: ${event.event_id}\nevent: agent-event\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;
  const laser = getAdapters().laser;
  const live = laser.info().mode === "live";

  const url = new URL(request.url);
  const wantsJson =
    url.searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) {
    const history = live
      ? (await laser.replay(runId)).map((record) => record.event)
      : getRunEvents(runId);
    const seen = new Set<string>();
    const events = history.filter((event) => {
      if (seen.has(event.event_id)) return false;
      seen.add(event.event_id);
      return true;
    });
    return Response.json({ run_id: runId, events });
  }

  let fromOffset = 0n;
  const lastEventId = request.headers.get("last-event-id");
  if (live) {
    await laser.ensureTopic(runId);
    if (lastEventId) {
      for (const record of await laser.replay(runId)) {
        if (record.event.event_id === lastEventId) fromOffset = record.offset + 1n;
      }
    }
  }

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let cleaned = false;
      const sent = new Set<string>();

      const send = (event: AgentEvent) => {
        if (closed || sent.has(event.event_id)) return;
        try {
          controller.enqueue(encodeSse(event));
          sent.add(event.event_id);
        } catch {
          closed = true;
          cleanup?.();
        }
      };

      let unsubscribe: () => void;
      if (live) {
        // A cursor beginning at a durable offset replays history and then
        // keeps polling, leaving no gap between two separate operations.
        unsubscribe = laser.subscribe(runId, send, {
          fromOffset,
          onError: () => cleanup?.(),
        });
      } else {
        const history = getRunEvents(runId);
        const resumeIndex = lastEventId
          ? history.findIndex((event) => event.event_id === lastEventId) + 1
          : 0;
        for (const event of history.slice(Math.max(0, resumeIndex))) send(event);
        unsubscribe = subscribeToRun(runId, send);
      }

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`: keepalive\n\n`));
        } catch {
          closed = true;
          cleanup?.();
        }
      }, KEEPALIVE_MS);

      cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      request.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

const injectEventSchema = z.object({
  event_type: z.enum(eventTypes),
  source_agent: z.enum(agentNames),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (getEnvConfig().sponsorMode !== "mock") {
    return Response.json(
      { error: "Event injection is only available when SPONSOR_MODE=mock." },
      { status: 403 },
    );
  }

  const { runId } = await context.params;
  const parsed = injectEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid event", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const event = emitEvent({
    run_id: runId,
    event_type: parsed.data.event_type,
    source_agent: parsed.data.source_agent,
    payload: parsed.data.payload ?? {},
  });
  recordAudit({
    run_id: runId,
    actor: "system",
    action: `events.injected:${event.event_type}`,
    details: { event_id: event.event_id },
  });
  return Response.json({ event }, { status: 201 });
}
