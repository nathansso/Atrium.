"use client";

import { eventTypes, type EventType } from "@/contracts";
import type { RunProjection } from "@/world/runState";
import type { Selection } from "./useAtrium";

const SHORT_LABEL: Record<EventType, string> = {
  "assignment.uploaded": "Upload",
  "assignment.concepts.extracted": "Concepts",
  "student.context.ready": "Memory",
  "groups.proposed": "Rooms",
  "accessibility.layers.ready": "Supports",
  "assignment.variants.ready": "Variants",
  "submissions.received": "Submit",
  "assessment.completed": "Assess",
  "student.models.updated": "Mastery",
  "lesson.plan.ready": "Tomorrow",
  "approval.requested": "Review",
};

/** What each stage of the pipeline actually does, shown on hover. */
const SLOT_TIP: Record<EventType, string> = {
  "assignment.uploaded": "Professor hands the assignment to the guide",
  "assignment.concepts.extracted": "Architect reads out the concepts",
  "student.context.ready": "Memory Library returns student histories",
  "groups.proposed": "Rooms formed by current learning barrier",
  "accessibility.layers.ready": "Delivery supports attached per student",
  "assignment.variants.ready": "One variant per room, objective preserved",
  "submissions.received": "Students carry work to the forge",
  "assessment.completed": "Grading finds misconceptions",
  "student.models.updated": "Mastery updates, students re-placed",
  "lesson.plan.ready": "Tomorrow's plan, with evidence",
  "approval.requested": "Low-confidence grade sent for review",
};

/** Slot colors echo the agent that emits the event. */
const SLOT_TONE: Record<EventType, string> = {
  "assignment.uploaded": "#ffd45c",
  "assignment.concepts.extracted": "#ffd45c",
  "student.context.ready": "#7ff0d2",
  "groups.proposed": "#9fd0ff",
  "accessibility.layers.ready": "#c8ffe6",
  "assignment.variants.ready": "#ffb765",
  "submissions.received": "#ff9a6b",
  "assessment.completed": "#ff9a6b",
  "student.models.updated": "#d5a6ff",
  "lesson.plan.ready": "#a6ff8f",
  "approval.requested": "#ffd45c",
};

/**
 * The eleven contract events rendered as a Minecraft hotbar. Discrete slots make
 * pipeline progress countable at a glance, and each filled slot is a shortcut to
 * the payload that filled it.
 */
export function PhaseTimeline({
  projection,
  selection,
  onSelect,
}: {
  projection: RunProjection;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const firstEventOfType = new Map<EventType, string>();
  for (const event of projection.events) {
    if (!firstEventOfType.has(event.event_type)) {
      firstEventOfType.set(event.event_type, event.event_id);
    }
  }
  const done = firstEventOfType.size;

  return (
    <section className="hotbar" aria-label="Pipeline progress">
      <div className="hotbar__head">
        <h2 className="hotbar__title">Agent pipeline</h2>
        <span className="hotbar__count">
          {done} / {eventTypes.length} stages
        </span>
      </div>
      <ol className="hotbar__slots">
        {eventTypes.map((eventType, index) => {
          const eventId = firstEventOfType.get(eventType);
          const isActive =
            selection.kind === "event" && selection.eventId === eventId;
          return (
            <li key={eventType}>
              <button
                type="button"
                className={`slot${eventId ? " slot--done" : ""}${
                  isActive ? " slot--active" : ""
                }`}
                disabled={!eventId}
                onClick={() => eventId && onSelect({ kind: "event", eventId })}
                data-tip={SLOT_TIP[eventType]}
                aria-label={`${SHORT_LABEL[eventType]} — ${
                  eventId ? "complete" : "pending"
                }. ${SLOT_TIP[eventType]}`}
              >
                <span
                  className="slot__glyph"
                  style={eventId ? { background: SLOT_TONE[eventType] } : undefined}
                  aria-hidden="true"
                />
                <span className="slot__label">{SHORT_LABEL[eventType]}</span>
                <span className="slot__key" aria-hidden="true">
                  {index + 1 <= 9 ? index + 1 : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export { SHORT_LABEL as STAGE_LABEL };
