"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/contracts";
import { summarizeEvent } from "@/world/eventSummary";

export type Toast = {
  id: string;
  kicker: string;
  body: string;
  tone: string;
};

const TOAST_TONE: Record<string, string> = {
  assignment_architect: "#ffd45c",
  student_memory_agent: "#7ff0d2",
  grouping_agent: "#9fd0ff",
  accessibility_agent: "#c8ffe6",
  assignment_curator: "#ffb765",
  assessment_agent: "#ff9a6b",
  classroom_evolution_agent: "#d5a6ff",
  lesson_planner: "#a6ff8f",
};

export function toastForEvent(event: AgentEvent): Toast {
  const kicker =
    event.event_type === "approval.requested"
      ? "Needs your review"
      : event.event_type === "lesson.plan.ready"
        ? "Run complete"
        : "Stage complete";
  return {
    id: event.event_id,
    kicker,
    body: summarizeEvent(event),
    tone: TOAST_TONE[event.source_agent] ?? "#ffc64d",
  };
}

const VISIBLE_MS = 3600;
const LEAVE_MS = 240;

/**
 * Minecraft advancement toasts.
 *
 * Without these, an event that fires while you are watching the world is only
 * recorded in the feed, which is off to the side — so the thing the demo most
 * wants you to notice is the thing you are most likely to miss.
 */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  const [visible, setVisible] = useState<Toast[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const fresh = toasts.filter((toast) => !seen.current.has(toast.id));
    if (fresh.length === 0) return;
    for (const toast of fresh) seen.current.add(toast.id);
    // Keep at most two on screen so a fast replay cannot bury the panels.
    setVisible((current) => [...current, ...fresh].slice(-2));

    for (const toast of fresh) {
      timers.current.push(
        setTimeout(() => {
          setLeaving((current) => new Set(current).add(toast.id));
          timers.current.push(
            setTimeout(() => {
              setVisible((current) => current.filter((t) => t.id !== toast.id));
              setLeaving((current) => {
                const next = new Set(current);
                next.delete(toast.id);
                return next;
              });
            }, LEAVE_MS),
          );
        }, VISIBLE_MS),
      );
    }
  }, [toasts]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className={`toast${leaving.has(toast.id) ? " toast--leaving" : ""}`}
        >
          <span
            className="toast__icon"
            style={{ background: toast.tone }}
            aria-hidden="true"
          />
          <span className="toast__text">
            <span className="toast__kicker">{toast.kicker}</span>
            <span className="toast__body">{toast.body}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
