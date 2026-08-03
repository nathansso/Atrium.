"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, RoomId } from "@/contracts";
import { WorldEngine, installWorldGlobals } from "@/world/engine";
import {
  ApiUnavailableError,
  approvePlan,
  backendAvailable,
  createRun,
  simulateSubmissions,
} from "@/world/api";
import { MOCK_RUN_ID, mockAssignment } from "@/world/mock/seed";
import { mockPhaseOneEvents, mockPhaseTwoEvents } from "@/world/mock/events";
import {
  applyEventToProjection,
  createRunProjection,
  type RunProjection,
} from "@/world/runState";
import { createMockReplay, createSseSource, type RunSource } from "@/world/source";
import type { BuildingId } from "@/world/types";

export type Selection =
  | { kind: "none" }
  | { kind: "student"; studentId: string }
  | { kind: "room"; roomId: RoomId }
  | { kind: "event"; eventId: string }
  | { kind: "plan_item"; itemId: string }
  | { kind: "building"; id: BuildingId }
  | { kind: "graph"; nodeId: string };

export type TransportMode = "mock" | "live";

export type RunStage =
  | "idle"
  | "phase_one"
  | "awaiting_simulation"
  | "phase_two"
  | "complete";

const STAGE_LABEL: Record<RunStage, string> = {
  idle: "Ready",
  phase_one: "Analyzing and building rooms",
  awaiting_simulation: "Rooms ready — run the classroom",
  phase_two: "Assessing and re-forming the school",
  complete: "Tomorrow's plan is ready",
};

export type AtriumController = ReturnType<typeof useAtrium>;

export function useAtrium() {
  const [engine] = useState(() => new WorldEngine({ minEventSpacing: 0.45 }));

  const sourceRef = useRef<RunSource | null>(null);
  const [projection, setProjection] = useState<RunProjection>(createRunProjection);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [stage, setStage] = useState<RunStage>("idle");
  const [transport, setTransport] = useState<TransportMode>("mock");
  const [backendDetected, setBackendDetected] = useState<boolean | null>(null);
  const [speed, setSpeed] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignmentText, setAssignmentText] = useState(String(mockAssignment.source_text ?? ""));
  const [teachingIntent, setTeachingIntent] = useState(String(mockAssignment.teaching_intent ?? ""));

  // Probe once so the badge can say "live API" or "mock replay" before any click.
  useEffect(() => {
    let cancelled = false;
    backendAvailable().then((available) => {
      if (cancelled) return;
      setBackendDetected(available);
      setTransport(available ? "live" : "mock");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    engine.start();
    const uninstall = installWorldGlobals(engine);
    return () => {
      engine.stop();
      uninstall();
    };
  }, [engine]);

  useEffect(() => {
    return () => {
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, []);

  const sink = useCallback(
    (event: AgentEvent) => {
      engine.push(event);
      setProjection((current) => applyEventToProjection(current, event));
      if (event.event_type === "assignment.variants.ready") {
        setStage((current) =>
          current === "phase_one" ? "awaiting_simulation" : current,
        );
      }
      // Contract: approval.requested must open the professor review panel.
      if (event.event_type === "approval.requested") {
        setStage("complete");
        setSelection({ kind: "building", id: "communication_beacon" });
      }
    },
    [engine],
  );

  const stopSource = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
  }, []);

  const startMockPhaseOne = useCallback(
    (runId: string) => {
      const source = createMockReplay(mockPhaseOneEvents(runId), sink, {
        speed,
        onComplete: () => setStage("awaiting_simulation"),
      });
      sourceRef.current = source;
      source.start();
    },
    [sink, speed],
  );

  const startRun = useCallback(async () => {
    stopSource();
    engine.reset();
    setProjection(createRunProjection());
    setSelection({ kind: "none" });
    setNotice(null);
    setStage("phase_one");

    if (transport === "live") {
      try {
        const response = await createRun({
          assignment_text: assignmentText,
          teaching_intent: teachingIntent,
          title: mockAssignment.title,
        });
        const source = createSseSource(response.run_id, sink, {
          terminalEvents: ["approval.requested"],
          onError: () =>
            setNotice("Live stream dropped. The world keeps the events it already received."),
        });
        sourceRef.current = source;
        source.start();
        return;
      } catch (error) {
        const reason =
          error instanceof ApiUnavailableError
            ? "No backend yet"
            : "Backend call failed";
        setNotice(`${reason} — replaying the frozen demo sequence instead.`);
        setTransport("mock");
      }
    }

    startMockPhaseOne(MOCK_RUN_ID);
  }, [
    assignmentText,
    engine,
    sink,
    startMockPhaseOne,
    stopSource,
    teachingIntent,
    transport,
  ]);

  const simulate = useCallback(async () => {
    setStage("phase_two");
    setNotice(null);

    if (transport === "live" && projection.runId) {
      try {
        await simulateSubmissions(projection.runId);
        return;
      } catch {
        setNotice("Simulation endpoint unavailable — replaying the frozen assessment phase.");
        setTransport("mock");
      }
    }

    stopSource();
    const source = createMockReplay(
      mockPhaseTwoEvents(projection.runId ?? MOCK_RUN_ID),
      sink,
      { speed, onComplete: () => setStage("complete") },
    );
    sourceRef.current = source;
    source.start();
  }, [projection.runId, sink, speed, stopSource, transport]);

  const approve = useCallback(
    async (reviewId: string) => {
      if (transport === "live" && projection.runId) {
        try {
          await approvePlan(projection.runId, reviewId);
        } catch {
          setNotice("Approval endpoint unavailable — recorded locally for the demo.");
        }
      }
      setProjection((current) => ({
        ...current,
        reviewQueue: current.reviewQueue.map((item) =>
          item.review_id === reviewId ? { ...item, status: "approved" as const } : item,
        ),
      }));
    },
    [projection.runId, transport],
  );

  const reset = useCallback(() => {
    stopSource();
    engine.reset();
    setProjection(createRunProjection());
    setSelection({ kind: "none" });
    setStage("idle");
    setNotice(null);
    if (backendDetected) setTransport("live");
  }, [backendDetected, engine, stopSource]);

  /** Drain queued events and settle animations without waiting on wall-clock. */
  const skipAnimation = useCallback(() => {
    engine.fastForward(30);
  }, [engine]);

  const selectEvent = useCallback((eventId: string) => {
    setSelection({ kind: "event", eventId });
  }, []);

  const canStart = stage === "idle" || stage === "complete";
  const canSimulate = stage === "awaiting_simulation";

  const stageLabel = useMemo(() => STAGE_LABEL[stage], [stage]);

  return {
    engine,
    projection,
    selection,
    setSelection,
    selectEvent,
    stage,
    stageLabel,
    transport,
    backendDetected,
    speed,
    setSpeed,
    notice,
    assignmentText,
    setAssignmentText,
    teachingIntent,
    setTeachingIntent,
    startRun,
    simulate,
    approve,
    reset,
    skipAnimation,
    canStart,
    canSimulate,
  };
}
