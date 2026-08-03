"use client";

import { useEffect, useMemo } from "react";
import { eventTypes } from "@/contracts";
import { WorldStage } from "@/components/world/WorldStage";
import { CommandRail } from "./CommandRail";
import { PhaseTimeline } from "./PhaseTimeline";
import { Toasts, toastForEvent } from "./Toasts";
import { useAtrium } from "./useAtrium";
import { WorkspacePanel } from "./WorkspacePanel";

export function AtriumApp({ initialRunId }: { initialRunId?: string }) {
  const controller = useAtrium({ initialRunId });
  const {
    engine,
    projection,
    selection,
    setSelection,
    approve,
    startRun,
    simulate,
    reset,
    evidence,
    canStart,
    canSimulate,
  } = controller;

  const toasts = useMemo(
    () => projection.events.map(toastForEvent),
    [projection.events],
  );

  // Keyboard shortcuts. Skipped while typing so the assignment editor is usable.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === "Escape") {
        setSelection({ kind: "none" });
        return;
      }
      if (event.key === "Enter") {
        if (canSimulate) {
          event.preventDefault();
          void simulate();
        } else if (canStart) {
          event.preventDefault();
          void startRun();
        }
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        reset();
        return;
      }
      // Number keys select the matching pipeline slot, like a real hotbar.
      const slot = Number.parseInt(event.key, 10);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 9) {
        const eventType = eventTypes[slot - 1];
        const match = projection.events.find((e) => e.event_type === eventType);
        if (match) {
          event.preventDefault();
          setSelection({ kind: "event", eventId: match.event_id });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canSimulate,
    canStart,
    projection.events,
    reset,
    setSelection,
    simulate,
    startRun,
  ]);

  return (
    <div className="app">
      <CommandRail controller={controller} />

      <main className="app__main">
        <div className="app__world">
          <PhaseTimeline
            projection={projection}
            selection={selection}
            onSelect={setSelection}
          />
          <WorldStage
            engine={engine}
            projection={projection}
            selection={selection}
            onSelect={setSelection}
          />
        </div>

        <aside className="app__side">
          <WorkspacePanel
            selection={selection}
            projection={projection}
            onSelect={setSelection}
            onApprove={(reviewId) => void approve(reviewId)}
            graph={engine.getState().graph}
            evidence={evidence}
          />
        </aside>
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}
