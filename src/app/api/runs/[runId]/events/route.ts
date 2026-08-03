/**
 * GET  /api/runs/:runId/events — SSE stream of agent events for a run.
 *      Replays full history, then streams live events. Send
 *      Accept: application/json (or ?format=json) for a plain history array.
 * POST /api/runs/:runId/events — mock-mode-only event injector so the
 *      frontend can drive animations before the agent loop is merged.
 */
import { z } from "zod";
import { agentNames, eventTypes, type AgentEvent } from "@/contracts";
import { trace } from "@/server/platform/guildWorkflow";
import { getEnvConfig } from "@/server/config";
import { emitEvent, getRunEvents, subscribeToRun } from "@/server/events";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

type RouteContext = { params: Promise<{ runId: string }> };

function encodeSse(event: AgentEvent): Uint8Array {
  return new TextEncoder().encode(`event: agent-event\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { runId } = await context.params;

  const wantsJson =
    new URL(request.url).searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) {
    return Response.json({ run_id: runId, events: getRunEvents(runId) });
  }

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSse(event));
        } catch {
          closed = true;
        }
      };

      // Replay history so late subscribers still see the full run.
      for (const event of getRunEvents(runId)) {
        send(event);
      }

      const unsubscribe = subscribeToRun(runId, send);
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`: keepalive\n\n`));
        } catch {
          closed = true;
        }
      }, KEEPALIVE_MS);

      cleanup = () => {
        if (closed) return;
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
  await trace({
    run_id: runId,
    actor: "system",
    action: `events.injected:${event.event_type}`,
    details: { event_id: event.event_id },
  });
  return Response.json({ event }, { status: 201 });
}
