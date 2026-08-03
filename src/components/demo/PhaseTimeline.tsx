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

/** Stage colors echo the agent that emits the event. */
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

const PIPELINE_PHASES = [
  {
    id: "prepare",
    label: "Prepare",
    stages: [
      "assignment.uploaded",
      "assignment.concepts.extracted",
      "student.context.ready",
    ],
  },
  {
    id: "personalize",
    label: "Personalize",
    stages: [
      "groups.proposed",
      "accessibility.layers.ready",
      "assignment.variants.ready",
    ],
  },
  {
    id: "run",
    label: "Run",
    stages: [
      "submissions.received",
      "assessment.completed",
      "student.models.updated",
    ],
  },
  {
    id: "review",
    label: "Review",
    stages: ["lesson.plan.ready", "approval.requested"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  stages: readonly EventType[];
}>;

/**
 * The eleven contract events grouped into four readable phases. Each completed
 * stage remains a shortcut to the payload that filled it.
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
    <section className="pipeline" aria-label="Pipeline progress">
      <header className="pipeline__header">
        <h2 className="pipeline__title">Learning pipeline</h2>
        <span className="pipeline__count">
          {done} / {eventTypes.length} stages
        </span>
      </header>

      <div className="pipeline__phases">
        {PIPELINE_PHASES.map((phase) => {
          const phaseDone = phase.stages.reduce(
            (count, eventType) =>
              count + (firstEventOfType.has(eventType) ? 1 : 0),
            0,
          );

          return (
            <section
              className="pipeline__phase"
              aria-labelledby={`pipeline-phase-${phase.id}`}
              key={phase.id}
            >
              <header className="pipeline__phase-header">
                <h3
                  className="pipeline__phase-title"
                  id={`pipeline-phase-${phase.id}`}
                >
                  {phase.label}
                </h3>
                <span className="pipeline__phase-count">
                  {phaseDone}/{phase.stages.length}
                </span>
              </header>

              <ol className="pipeline__stages">
                {phase.stages.map((eventType) => {
                  const eventId = firstEventOfType.get(eventType);
                  const isActive =
                    selection.kind === "event" &&
                    selection.eventId === eventId;
                  const stageNumber =
                    eventTypes.findIndex((type) => type === eventType) + 1;

                  return (
                    <li className="pipeline__stage-item" key={eventType}>
                      <button
                        type="button"
                        className={`pipeline__stage${
                          eventId ? " pipeline__stage--done" : ""
                        }${isActive ? " pipeline__stage--active" : ""}`}
                        disabled={!eventId}
                        onClick={() =>
                          eventId && onSelect({ kind: "event", eventId })
                        }
                        data-tip={SLOT_TIP[eventType]}
                        title={SLOT_TIP[eventType]}
                        aria-label={`${SHORT_LABEL[eventType]} — ${
                          eventId ? "complete" : "pending"
                        }. ${SLOT_TIP[eventType]}`}
                      >
                        <span
                          className="pipeline__stage-marker"
                          style={
                            eventId
                              ? { background: SLOT_TONE[eventType] }
                              : undefined
                          }
                          aria-hidden="true"
                        />
                        <span className="pipeline__stage-label">
                          {SHORT_LABEL[eventType]}
                        </span>
                        {stageNumber <= 9 ? (
                          <span
                            className="pipeline__stage-key"
                            aria-hidden="true"
                          >
                            {stageNumber}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export { SHORT_LABEL as STAGE_LABEL };
