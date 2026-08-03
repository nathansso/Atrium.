"use client";

import { useEffect, useRef } from "react";
import { humanize } from "@/world/payloads";
import { summarizeEvent } from "@/world/eventSummary";
import type { RunProjection } from "@/world/runState";
import type { Selection } from "@/components/demo/useAtrium";

const AGENT_TONE: Record<string, string> = {
  assignment_architect: "#ffd45c",
  student_memory_agent: "#7ff0d2",
  grouping_agent: "#9fd0ff",
  accessibility_agent: "#c8ffe6",
  assignment_curator: "#ffb765",
  assessment_agent: "#ff9a6b",
  classroom_evolution_agent: "#d5a6ff",
  lesson_planner: "#a6ff8f",
};

export function AgentFeed({
  projection,
  selection,
  onSelect,
}: {
  projection: RunProjection;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const count = projection.events.length;

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  return (
    <div className="feed">
      <header className="feed__head">
        <h3 className="section__title">Agent event feed</h3>
        <span className="feed__count">{count} events</span>
      </header>
      {count === 0 ? (
        <p className="muted feed__empty">
          No events yet. Start a run to watch the agent mesh emit typed events.
        </p>
      ) : (
        <ol className="feed__list" ref={listRef}>
          {projection.events.map((event) => {
            const active =
              selection.kind === "event" && selection.eventId === event.event_id;
            return (
              <li key={event.event_id}>
                <button
                  type="button"
                  className={`feed__item${active ? " feed__item--active" : ""}`}
                  onClick={() => onSelect({ kind: "event", eventId: event.event_id })}
                >
                  <span
                    className="feed__dot"
                    style={{ background: AGENT_TONE[event.source_agent] ?? "#8899cc" }}
                    aria-hidden="true"
                  />
                  <span className="feed__text">
                    <span className="feed__type">{event.event_type}</span>
                    <span className="feed__summary">{summarizeEvent(event)}</span>
                    <span className="feed__agent">{humanize(event.source_agent)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
